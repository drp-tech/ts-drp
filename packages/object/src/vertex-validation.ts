import type { IHashGraph, Vertex } from "@ts-drp/types";
import { computeHash } from "@ts-drp/utils/hash";

export class InvalidHashError extends Error {
	constructor(message: string = "Invalid hash") {
		super(message);
		this.name = "InvalidHashError";
	}
}

export class InvalidDependenciesError extends Error {
	constructor(message: string = "Invalid dependencies") {
		super(message);
		this.name = "InvalidDependenciesError";
	}
}

export class InvalidTimestampError extends Error {
	constructor(message: string = "Invalid timestamp") {
		super(message);
		this.name = "InvalidTimestampError";
	}
}

export function validateVertexHash({ hash, peerId, operation, dependencies, timestamp }: Vertex): void {
	const computedHash = computeHash(peerId, operation, dependencies, timestamp);
	if (hash !== computedHash) {
		throw new InvalidHashError(`Invalid hash for vertex ${hash}`);
	}
}

export function validateVertexDependencies({ dependencies, hash, timestamp }: Vertex, hg: IHashGraph): void {
	if (dependencies.length === 0) {
		throw new InvalidDependenciesError(`Vertex ${hash} has no dependencies.`);
	}

	for (const dependency of dependencies) {
		const dependencyVertex = hg.getVertex(dependency);
		if (!dependencyVertex) {
			throw new InvalidDependenciesError(`Vertex ${hash} has invalid dependency ${dependency}.`);
		}

		validateVertexTimestamp(dependencyVertex.timestamp, timestamp, hash);
	}
}

export function validateVertexTimestamp(depTs: number, ts: number, hash: string): void {
	if (depTs > ts) {
		throw new InvalidTimestampError(`Vertex ${hash} has invalid timestamp ${depTs} > ${ts}.`);
	}
}
