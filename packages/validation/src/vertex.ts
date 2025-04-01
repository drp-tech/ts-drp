import { type IHashGraph, type Vertex } from "@ts-drp/types";
import { computeHash } from "@ts-drp/utils/hash";

import { InvalidDependenciesError, InvalidHashError, InvalidTimestampError } from "./errors.js";

export interface ValidationResult {
	success: boolean;
	error?: Error;
}

function validateVertexHash({ hash, peerId, operation, dependencies, timestamp }: Vertex): void {
	const correctHash = computeHash(peerId, operation, dependencies, timestamp);
	if (hash !== correctHash) {
		throw new InvalidHashError(`Invalid hash for vertex ${hash}`);
	}
}

function validateVertexDependencies({ hash, dependencies, timestamp }: Vertex, hashGraph: IHashGraph): void {
	if (dependencies.length === 0) {
		throw new InvalidDependenciesError(`Vertex ${hash} has no dependencies.`);
	}
	for (const dep of dependencies) {
		const depVertex = hashGraph.vertices.get(dep);
		if (depVertex === undefined) {
			throw new InvalidDependenciesError(`Vertex ${hash} has invalid dependency ${dep}.`);
		}
		validateVertexTimestamp(depVertex.timestamp, timestamp, hash);
	}
}

function validateVertexTimestamp(a: number, b: number, hash: string): void {
	if (a > b) {
		throw new InvalidTimestampError(`Vertex ${hash} has invalid timestamp ${a} > ${b}`);
	}
}

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
