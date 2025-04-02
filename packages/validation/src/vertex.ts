import { type IHashGraph, type Vertex } from "@ts-drp/types";
import { computeHash } from "@ts-drp/utils/hash";

export interface ValidationResult {
	success: boolean;
	error?: Error;
}

function validateVertexHash(vertex: Vertex): void {
	const correctHash = computeHash(vertex.peerId, vertex.operation, vertex.dependencies, vertex.timestamp);
	if (vertex.hash !== correctHash) {
		throw new Error(`Vertex ${vertex.hash} has invalid hash`);
	}
}

function validateVertexDependencies(vertex: Vertex, hashGraph: IHashGraph): void {
	if (vertex.dependencies.length === 0) {
		throw new Error(`Vertex ${vertex.hash} has no dependencies`);
	}
	for (const dep of vertex.dependencies) {
		const depVertex = hashGraph.vertices.get(dep);
		if (depVertex === undefined) {
			throw new Error(`Vertex ${vertex.hash} has invalid dependency ${dep}`);
		}
		validateVertexTimestamp(depVertex.timestamp, vertex.timestamp, vertex.hash);
	}
}

function validateVertexTimestamp(a: number, b: number, hash: string): void {
	if (a > b) {
		throw new Error(`Vertex ${hash} has invalid timestamp`);
	}
}

/**
 * Validates a vertex, three validation checks are performed:
 * 1. The vertex hash is validated
 * 2. The vertex dependencies are validated
 * 3. The vertex timestamp is validated
 * @param vertex - The vertex to validate
 * @param hashGraph - The hash graph
 * @param currentTimeStamp - The current timestamp
 * @returns The validation result
 */
export function validateVertex(vertex: Vertex, hashGraph: IHashGraph, currentTimeStamp: number): ValidationResult {
	try {
		validateVertexHash(vertex);
		validateVertexDependencies(vertex, hashGraph);
		validateVertexTimestamp(vertex.timestamp, currentTimeStamp, vertex.hash);
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error : new Error(`Vertex validation unknown error for vertex ${vertex.hash}`),
		};
	}
}
