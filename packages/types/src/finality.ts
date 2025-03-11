import { type IBitSet } from "./bitset.js";
import { type DRPPublicCredential } from "./credentials.js";
import { type Hash } from "./hashgraph.js";
import { type AggregatedAttestation, type Attestation } from "./proto/drp/v1/object_pb.js";

export interface IFinalityState {
	/**
	 * The data of the finality state.
	 */
	readonly data: string;
	/**
	 * The signer credentials of the finality state.
	 */
	readonly signerCredentials: DRPPublicCredential[];
	/**
	 * The signer indices of the finality state.
	 */
	readonly signerIndices: Map<string, number>;
	/**
	 * The aggregation bits of the finality state.
	 */
	aggregation_bits: IBitSet;
	/**
	 * The signature of the finality state.
	 */
	signature?: Uint8Array;
	/**
	 * The number of signatures of the finality state.
	 */
	numberOfSignatures: number;

	/**
	 * Adds a signature to the finality state.
	 *
	 * @param peerId - The peer id of the signer.
	 * @param signature - The signature to add.
	 * @param verify - Whether to verify the signature.
	 */
	addSignature(peerId: string, signature: Uint8Array, verify?: boolean): void;
	/**
	 * Merges an aggregated attestation into the finality state.
	 *
	 * @param attestation - The aggregated attestation to merge.
	 */
	merge(attestation: AggregatedAttestation): void;
}

export interface IFinalityStore {
	/**
	 * The states of the finality store.
	 */
	states: Map<string, IFinalityState>;
	/**
	 * The finality threshold of the finality store.
	 */
	readonly finalityThreshold: number;

	/**
	 * Initializes the finality state for a given hash.
	 *
	 * @param hash - The hash of the finality state.
	 * @param signers - The signers of the finality state.
	 */
	initializeState(hash: Hash, signers: Map<string, DRPPublicCredential>): void;
	/**
	 * Returns the number of signatures required for the given hash to be finalized.
	 *
	 * @param hash - The hash of the finality state.
	 * @returns The number of signatures required for the given hash to be finalized.
	 */
	getQuorum(hash: Hash): number | undefined;
	/**
	 * Returns the number of signatures for a given hash.
	 *
	 * @param hash - The hash of the finality state.
	 * @returns The number of signatures for the given hash.
	 */
	getNumberOfSignatures(hash: Hash): number | undefined;
	/**
	 * Returns true if the given hash is finalized.
	 *
	 * @param hash - The hash of the finality state.
	 * @returns True if the given hash is finalized.
	 */
	isFinalized(hash: Hash): boolean | undefined;
	/**
	 * Returns true if the given peer id can sign the given hash.
	 *
	 * @param peerId - The peer id of the signer.
	 * @param hash - The hash of the finality state.
	 * @returns True if the given peer id can sign the given hash.
	 */
	canSign(peerId: string, hash: Hash): boolean | undefined;
	/**
	 * Returns true if the given peer id has signed the given hash.
	 *
	 * @param peerId - The peer id of the signer.
	 * @param hash - The hash of the finality state.
	 * @returns True if the given peer id has signed the given hash.
	 */
	signed(peerId: string, hash: Hash): boolean | undefined;
	/**
	 * Adds signatures to the given hash.
	 *
	 * @param peerId - The peer id of the signer.
	 * @param attestations - The attestations to add.
	 */
	addSignatures(peerId: string, attestations: Attestation[], verify?: boolean): void;
	/**
	 * Returns the aggregated attestation for the given hash.
	 *
	 * @param hash - The hash of the finality state.
	 * @returns The aggregated attestation for the given hash.
	 */
	getAttestation(hash: Hash): AggregatedAttestation | undefined;
	/**
	 * Merges multiple aggregated attestations into the finality store.
	 *
	 * @param attestations - The aggregated attestations to merge.
	 */
	mergeSignatures(attestations: AggregatedAttestation[]): void;
}
