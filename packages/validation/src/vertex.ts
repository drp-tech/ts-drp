import { type IHashGraph, type Vertex } from "@ts-drp/types";
import { computeHash } from "@ts-drp/utils/hash";

export interface ValidationResult {
	valid: boolean;
	error?: string;
}

function validateVertexHash(vertex: Vertex): void {
	const correctHash = computeHash(vertex.peerId, vertex.operation, vertex.dependencies, vertex.timestamp);
	if (vertex.hash !== correctHash) {
		throw new Error(`Vertex ${vertex.hash} has invalid hash.`);
	}
}

function validateVertexDependencies(vertex: Vertex, hashGraph: IHashGraph): void {
	if (vertex.dependencies.length === 0) {
		throw new Error(`Vertex ${vertex.hash} has no dependencies.`);
	}
	for (const dep of vertex.dependencies) {
		const depVertex = hashGraph.vertices.get(dep);
		if (depVertex === undefined) {
			throw new Error(`Vertex ${vertex.hash} has invalid dependency ${dep}.`);
		}
		validateVertexTimestamp(depVertex.timestamp, vertex.timestamp, vertex.hash);
	}
}

function validateVertexTimestamp(a: number, b: number, hash: string): void {
	if (a > b) {
		throw new Error(`Vertex ${hash} has invalid timestamp.`);
	}
}

export function validateVertex(vertex: Vertex, hashGraph: IHashGraph, currentTimeStamp: number): ValidationResult {
	try {
		validateVertexHash(vertex);
		validateVertexDependencies(vertex, hashGraph);
		validateVertexTimestamp(vertex.timestamp, currentTimeStamp, vertex.hash);
		return { valid: true };
	} catch (error) {
		return { valid: false, error: (error as Error).message };
	}
}
