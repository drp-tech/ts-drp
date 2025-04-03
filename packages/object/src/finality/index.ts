import { bls } from "@chainsafe/bls/herumi";
import { Logger } from "@ts-drp/logger";
import {
	AggregatedAttestation,
	type Attestation,
	type FinalityConfig,
	type Hash,
	type IFinalityState,
	type IFinalityStore,
	type LoggerOptions,
} from "@ts-drp/types";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";

import { BitSet } from "../hashgraph/bitset.js";

const DEFAULT_FINALITY_THRESHOLD = 0.51;

/**
 * FinalityState is a class that implements the IFinalityState interface.
 * It represents the state of a vertex in the finality store.
 */
export class FinalityState implements IFinalityState {
	data: string;
	signerCredentials: string[];
	signerIndices: Map<string, number>;
	aggregation_bits: BitSet;
	signature?: Uint8Array;
	numberOfSignatures: number;

	/**
	 * Creates a new FinalityState instance.
	 * @param hash - The hash of the vertex.
	 * @param signers - The signers of the vertex.
	 */
	constructor(hash: Hash, signers: Map<string, string>) {
		this.data = hash;

		// deterministic order
		const peerIds = Array.from(signers.keys()).sort();
		this.signerCredentials = peerIds.map((peerId) => signers.get(peerId)).filter((c) => c !== undefined);

		this.signerIndices = new Map();
		for (let i = 0; i < peerIds.length; i++) {
			this.signerIndices.set(peerIds[i], i);
		}

		this.aggregation_bits = new BitSet(peerIds.length);
		this.numberOfSignatures = 0;
	}

	/**
	 * Adds a signature to the vertex.
	 * @param peerId - The peer ID of the signer.
	 * @param signature - The signature to add.
	 * @param verify - Whether to verify the signature.
	 */
	addSignature(peerId: string, signature: Uint8Array, verify = true): void {
		const index = this.signerIndices.get(peerId);
		if (index === undefined) {
			throw new Error("Peer not found in signer list");
		}

		if (!this.signerCredentials[index]) {
			throw new Error("Signer credentials not found");
		}

		if (this.aggregation_bits.get(index)) {
			// signer already signed
			return;
		}

		if (verify) {
			// verify signature validity
			const publicKey = uint8ArrayFromString(this.signerCredentials[index], "base64");
			const data = uint8ArrayFromString(this.data);
			if (!bls.verify(publicKey, data, signature)) {
				throw new Error("Invalid signature");
			}
		}

		this.aggregation_bits.set(index, true);
		if (!this.signature) {
			this.signature = signature;
		} else {
			this.signature = bls.aggregateSignatures([this.signature, signature]);
		}
		this.numberOfSignatures++;
	}

	/**
	 * Merges an attestation into the current state.
	 * @param attestation - The attestation to merge.
	 */
	merge(attestation: AggregatedAttestation): void {
		if (this.data !== attestation.data) {
			throw new Error("Hash mismatch");
		}

		if (this.signature) {
			return;
		}

		const aggregation_bits = new BitSet(this.signerCredentials.length, attestation.aggregationBits);

		// public keys of signers who signed
		const publicKeys = this.signerCredentials
			.filter((_, i) => aggregation_bits.get(i))
			.map((signer) => uint8ArrayFromString(signer, "base64"));
		const data = uint8ArrayFromString(this.data);

		// verify signature validity
		if (!bls.verifyAggregate(publicKeys, data, attestation.signature)) {
			throw new Error("Invalid signature");
		}

		this.aggregation_bits = aggregation_bits;
		this.signature = attestation.signature;
		this.numberOfSignatures = publicKeys.length;
	}
}

/**
 * Manages the finality states of vertices.
 */
export class FinalityStore implements IFinalityStore {
	states: Map<string, FinalityState>;
	finalityThreshold: number;

	private log: Logger;

	/**
	 * Creates a new FinalityStore instance.
	 * @param config @default undefined - The finality configuration.
	 * @param logConfig @default undefined - The logger configuration.
	 */
	constructor(config?: FinalityConfig, logConfig?: LoggerOptions) {
		this.states = new Map();
		this.finalityThreshold = config?.finality_threshold ?? DEFAULT_FINALITY_THRESHOLD;

		this.log = new Logger("drp::finality", logConfig);
	}

	/**
	 * Initializes a new state for a vertex.
	 * @param hash - The hash of the vertex.
	 * @param signers - The signers of the vertex.
	 */
	initializeState(hash: Hash, signers: Map<string, string>): void {
		if (!this.states.has(hash)) {
			this.states.set(hash, new FinalityState(hash, signers));
		}
	}

	/**
	 * Returns the number of signatures required for finality.
	 * @param hash - The hash of the vertex.
	 * @returns The quorum.
	 */
	getQuorum(hash: Hash): number | undefined {
		const state = this.states.get(hash);
		if (state === undefined) {
			return;
		}
		return Math.ceil(state.signerCredentials.length * this.finalityThreshold);
	}

	/**
	 * Returns the current number of signatures.
	 * @param hash - The hash of the vertex.
	 * @returns The number of signatures.
	 */
	getNumberOfSignatures(hash: Hash): number | undefined {
		return this.states.get(hash)?.numberOfSignatures;
	}

	/**
	 * Checks if a vertex has reached finality.
	 * @param hash - The hash of the vertex.
	 * @returns Whether the vertex has reached finality.
	 */
	isFinalized(hash: Hash): boolean | undefined {
		const numberOfSignatures = this.getNumberOfSignatures(hash);
		const quorum = this.getQuorum(hash);
		if (numberOfSignatures !== undefined && quorum !== undefined) {
			return numberOfSignatures >= quorum;
		}
	}

	/**
	 * Checks if a peer can sign a vertex.
	 * @param peerId - The peer ID of the signer.
	 * @param hash - The hash of the vertex.
	 * @returns Whether the peer can sign the vertex.
	 */
	canSign(peerId: string, hash: Hash): boolean | undefined {
		return this.states.get(hash)?.signerIndices.has(peerId);
	}

	/**
	 * Checks if a peer has signed a vertex.
	 * @param peerId - The peer ID of the signer.
	 * @param hash - The hash of the vertex.
	 * @returns Whether the peer has signed the vertex.
	 */
	signed(peerId: string, hash: Hash): boolean | undefined {
		const state = this.states.get(hash);
		if (state !== undefined) {
			const index = state.signerIndices.get(peerId);
			if (index !== undefined) {
				return state.aggregation_bits.get(index);
			}
		}
	}

	/**
	 * Adds signatures to vertices.
	 * @param peerId - The peer ID of the signer.
	 * @param attestations - The attestations to add.
	 * @param verify @default true - Whether to verify the signatures.
	 * @returns The added attestations.
	 */
	addSignatures(peerId: string, attestations: Attestation[], verify = true): Attestation[] {
		const added = [];
		for (const attestation of attestations) {
			try {
				this.states.get(attestation.data)?.addSignature(peerId, attestation.signature, verify);
				added.push(attestation);
			} catch (e) {
				this.log.warn("::finality::addSignatures", e);
			}
		}
		return added;
	}

	/**
	 * Retrieves the attestation for a vertex.
	 * @param hash - The hash of the vertex.
	 * @returns The attestation.
	 */
	getAttestation(hash: Hash): AggregatedAttestation | undefined {
		const state = this.states.get(hash);
		if (state !== undefined && state.signature !== undefined) {
			return AggregatedAttestation.create({
				data: state.data,
				aggregationBits: state.aggregation_bits.toBytes(),
				signature: state.signature,
			});
		}
	}

	/**
	 * Merges multiple signatures into their respective states.
	 * @param attestations - The attestations to merge.
	 */
	mergeSignatures(attestations: AggregatedAttestation[]): void {
		for (const attestation of attestations) {
			try {
				this.states.get(attestation.data)?.merge(attestation);
			} catch (e) {
				this.log.warn("::finality::mergeSignatures", e);
			}
		}
	}
}
