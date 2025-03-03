import { bls } from "@chainsafe/bls/herumi";
import { Logger } from "@ts-drp/logger";
import { LoggerOptions, AggregatedAttestation, Attestation } from "@ts-drp/types";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";

import { BitSet } from "../hashgraph/bitset.js";
import type { Hash } from "../hashgraph/index.js";
import { type DRPPublicCredential } from "../index.js";

const DEFAULT_FINALITY_THRESHOLD = 0.51;

export interface FinalityConfig {
	finality_threshold?: number;
}

export class FinalityState {
	data: string;
	signerCredentials: DRPPublicCredential[];
	signerIndices: Map<string, number>;
	aggregation_bits: BitSet;
	signature?: Uint8Array;
	numberOfSignatures: number;

	constructor(hash: Hash, signers: Map<string, DRPPublicCredential>) {
		this.data = hash;

		// deterministic order
		const peerIds = Array.from(signers.keys()).sort();
		this.signerCredentials = peerIds.map((peerId) => signers.get(peerId)) as DRPPublicCredential[];

		this.signerIndices = new Map();
		for (let i = 0; i < peerIds.length; i++) {
			this.signerIndices.set(peerIds[i], i);
		}

		this.aggregation_bits = new BitSet(peerIds.length);
		this.numberOfSignatures = 0;
	}

	addSignature(peerId: string, signature: Uint8Array, verify = true) {
		const index = this.signerIndices.get(peerId);
		if (index === undefined) {
			throw new Error("Peer not found in signer list");
		}

		if (this.aggregation_bits.get(index)) {
			// signer already signed
			return;
		}

		if (verify) {
			// verify signature validity
			const publicKey = uint8ArrayFromString(this.signerCredentials[index].blsPublicKey, "base64");
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

	merge(attestation: AggregatedAttestation) {
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
			.map((signer) => uint8ArrayFromString(signer.blsPublicKey, "base64"));
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

export class FinalityStore {
	states: Map<string, FinalityState>;
	finalityThreshold: number;

	private log: Logger;

	constructor(config?: FinalityConfig, logConfig?: LoggerOptions) {
		this.states = new Map();
		this.finalityThreshold = config?.finality_threshold ?? DEFAULT_FINALITY_THRESHOLD;

		this.log = new Logger("drp::finality", logConfig);
	}

	initializeState(hash: Hash, signers: Map<string, DRPPublicCredential>) {
		if (!this.states.has(hash)) {
			this.states.set(hash, new FinalityState(hash, signers));
		}
	}

	// returns the number of signatures required for the vertex to be finalized
	getQuorum(hash: Hash): number | undefined {
		const state = this.states.get(hash);
		if (state === undefined) {
			return;
		}
		return Math.ceil(state.signerCredentials.length * this.finalityThreshold);
	}

	// returns the number of signatures for the vertex
	getNumberOfSignatures(hash: Hash): number | undefined {
		return this.states.get(hash)?.numberOfSignatures;
	}

	// returns true if the vertex is finalized
	isFinalized(hash: Hash): boolean | undefined {
		const numberOfSignatures = this.getNumberOfSignatures(hash);
		const quorum = this.getQuorum(hash);
		if (numberOfSignatures !== undefined && quorum !== undefined) {
			return numberOfSignatures >= quorum;
		}
	}

	// returns true if the specified peerId can sign the vertex
	canSign(peerId: string, hash: Hash): boolean | undefined {
		return this.states.get(hash)?.signerIndices.has(peerId);
	}

	// returns true if the specified peerId has signed on the vertex
	signed(peerId: string, hash: Hash): boolean | undefined {
		const state = this.states.get(hash);
		if (state !== undefined) {
			const index = state.signerIndices.get(peerId);
			if (index !== undefined) {
				return state.aggregation_bits.get(index);
			}
		}
	}

	// add signatures to the vertex
	addSignatures(peerId: string, attestations: Attestation[], verify = true) {
		for (const attestation of attestations) {
			try {
				this.states.get(attestation.data)?.addSignature(peerId, attestation.signature, verify);
			} catch (e) {
				this.log.error("::finality::addSignatures", e);
			}
		}
	}

	// returns the attestations for the vertex
	getAttestation(hash: Hash): AggregatedAttestation | undefined {
		const state = this.states.get(hash);
		if (state !== undefined && state.signature !== undefined) {
			return {
				data: state.data,
				aggregationBits: state.aggregation_bits.toBytes(),
				signature: state.signature,
			};
		}
	}

	// merge multiple signatures
	mergeSignatures(attestations: AggregatedAttestation[]) {
		for (const attestation of attestations) {
			try {
				this.states.get(attestation.data)?.merge(attestation);
			} catch (e) {
				this.log.error("::finality::mergeSignatures", e);
			}
		}
	}
}
