import { type Hash, type Operation, Vertex } from "@ts-drp/types";
import { computeHash } from "@ts-drp/utils/hash";

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
