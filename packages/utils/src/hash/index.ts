import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import type { Hash, Operation } from "@ts-drp/types";

/**
 * Computes a hash for a given operation and dependencies
 * @param peerId - The peer ID of the node
 * @param operation - The operation to hash
 * @param deps - The dependencies of the operation
 * @param timestamp - The timestamp of the operation
 * @returns The computed hash
 */
export function computeHash(peerId: string, operation: Operation | undefined, deps: Hash[], timestamp: number): Hash {
	const serialized = JSON.stringify({ operation, deps, peerId, timestamp });
	const hash = sha256.create().update(serialized).digest();
	return bytesToHex(hash);
}
