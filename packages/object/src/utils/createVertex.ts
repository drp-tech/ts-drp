import { type Hash, type Operation, Vertex } from "@ts-drp/types";
import { computeHash } from "@ts-drp/utils/hash";

/**
 * Creates a new vertex
 * @param peerId - The peer id of the vertex
 * @param operation - The operation of the vertex
 * @param dependencies - The dependencies of the vertex
 * @param timestamp - The timestamp of the vertex
 * @param signature - The signature of the vertex
 * @returns The new vertex
 */
export function createVertex(
	peerId: string,
	operation: Operation,
	dependencies: Hash[],
	timestamp: number,
	signature?: Uint8Array
): Vertex {
	const hash = computeHash(peerId, operation, dependencies, timestamp);
	return Vertex.create({
		hash,
		peerId,
		operation,
		dependencies,
		timestamp,
		signature,
	});
}
