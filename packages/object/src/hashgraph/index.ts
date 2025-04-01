import { Logger } from "@ts-drp/logger";
import {
	ActionType,
	type Hash,
	type IHashGraph,
	type LoggerOptions,
	Operation,
	type ResolveConflictsType,
	SemanticsType,
	Vertex,
} from "@ts-drp/types";
import { ObjectSet } from "@ts-drp/utils";
import { computeHash } from "@ts-drp/utils/hash";

import { BitSet } from "./bitset.js";
import { linearizeMultipleSemantics } from "../linearize/multipleSemantics.js";
import { linearizePairSemantics } from "../linearize/pairSemantics.js";

export enum OperationType {
	// TODO: rename this and make it part of action type this is the init action for the object
	NOP = "-1",
}

export type VertexDistance = {
	distance: number;
	closestDependency?: Hash;
};

export class HashGraph implements IHashGraph {
	peerId: string;
	semanticsTypeDRP?: SemanticsType;

	vertices: Map<Hash, Vertex> = new Map();
	frontier: Hash[] = [];
	forwardEdges: Map<Hash, Hash[]> = new Map();

	private log: Logger;

	/*
	computeHash(
		"",
		{ type: OperationType.NOP, value: null },
		[],
		-1,
	);
	*/
	static readonly rootHash: Hash = "425d2b1f5243dbf23c685078034b06fbfa71dc31dcce30f614e28023f140ff13";
	private arePredecessorsFresh = false;
	private reachablePredecessors: Map<Hash, BitSet> = new Map();
	private topoSortedIndex: Map<Hash, number> = new Map();
	private vertexDistances: Map<Hash, VertexDistance> = new Map();
	// We start with a bitset of size 1, and double it every time we reach the limit
	private currentBitsetSize = 1;

	constructor(
		peerId: string,
		resolveConflictsACL?: (vertices: Vertex[]) => ResolveConflictsType,
		resolveConflictsDRP?: (vertices: Vertex[]) => ResolveConflictsType,
		semanticsTypeDRP?: SemanticsType,
		logConfig?: LoggerOptions
	) {
		this.peerId = peerId;
		if (resolveConflictsACL) this.resolveConflictsACL = resolveConflictsACL;
		if (resolveConflictsDRP) this.resolveConflictsDRP = resolveConflictsDRP;
		this.semanticsTypeDRP = semanticsTypeDRP;
		this.log = new Logger("drp::hashgraph", logConfig);

		const rootVertex = Vertex.create({
			hash: HashGraph.rootHash,
			peerId: "",
			operation: Operation.create({ drpType: "", opType: OperationType.NOP }),
			dependencies: [],
			timestamp: -1,
			signature: new Uint8Array(),
		});
		this.vertices.set(HashGraph.rootHash, rootVertex);
		this.frontier.push(HashGraph.rootHash);
		this.forwardEdges.set(HashGraph.rootHash, []);
		this.vertexDistances.set(HashGraph.rootHash, {
			distance: 0,
		});
	}

	resolveConflictsDRP(_: Vertex[]): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
	resolveConflictsACL(_: Vertex[]): ResolveConflictsType {
		return { action: ActionType.Nop };
	}

	resolveConflicts(vertices: Vertex[]): ResolveConflictsType {
		if (vertices[0].operation?.drpType === "ACL") {
			return this.resolveConflictsACL(vertices);
		}
		return this.resolveConflictsDRP(vertices);
	}

	createVertex(operation: Operation, dependencies: Hash[], timestamp: number): Vertex {
		return Vertex.create({
			hash: computeHash(this.peerId, operation, dependencies, timestamp),
			peerId: this.peerId,
			timestamp,
			operation,
			dependencies,
		});
	}

	// Add a new vertex to the hashgraph.
	addVertex(vertex: Vertex): void {
		this.vertices.set(vertex.hash, vertex);
		this.frontier.push(vertex.hash);
		// Update forward edges
		for (const dep of vertex.dependencies) {
			if (!this.forwardEdges.has(dep)) {
				this.forwardEdges.set(dep, []);
			}
			this.forwardEdges.get(dep)?.push(vertex.hash);
		}

		// Compute the distance of the vertex
		const vertexDistance: VertexDistance = {
			distance: Number.MAX_VALUE,
			closestDependency: "",
		};
		for (const dep of vertex.dependencies) {
			const depDistance = this.vertexDistances.get(dep);
			if (depDistance && depDistance.distance + 1 < vertexDistance.distance) {
				vertexDistance.distance = depDistance.distance + 1;
				vertexDistance.closestDependency = dep;
			}
		}
		this.vertexDistances.set(vertex.hash, vertexDistance);

		const depsSet = new Set(vertex.dependencies);
		this.frontier = this.frontier.filter((hash) => !depsSet.has(hash));
		this.arePredecessorsFresh = false;
	}

	dfsTopologicalSortIterative(origin: Hash, subgraph: ObjectSet<Hash>): Hash[] {
		const visited = new ObjectSet<Hash>();
		const result: Hash[] = Array(subgraph.size);
		const stack: Hash[] = Array(subgraph.size);
		const processing = new ObjectSet<Hash>();
		let resultIndex = subgraph.size - 1;
		let stackIndex = 0;
		stack[stackIndex] = origin;

		while (resultIndex >= 0) {
			const node = stack[stackIndex];

			if (visited.has(node)) {
				result[resultIndex] = node;
				stackIndex--;
				resultIndex--;
				processing.delete(node);
				continue;
			}

			processing.add(node);
			visited.add(node);

			const neighbors = this.forwardEdges.get(node);
			if (neighbors) {
				for (const neighbor of neighbors.sort()) {
					if (processing.has(neighbor)) throw new Error("Graph contains a cycle!");
					if (subgraph.has(neighbor) && !visited.has(neighbor)) {
						stackIndex++;
						stack[stackIndex] = neighbor;
					}
				}
			}
		}

		return result;
	}

	/* Topologically sort the vertices in the whole hashgraph or the past of a given vertex. */
	topologicalSort(
		updateBitsets = false,
		origin: Hash = HashGraph.rootHash,
		subgraph: ObjectSet<Hash> = new ObjectSet(this.vertices.keys())
	): Hash[] {
		const result = this.dfsTopologicalSortIterative(origin, subgraph);
		if (!updateBitsets) return result;
		this.reachablePredecessors.clear();
		this.topoSortedIndex.clear();

		// Double the size until it's enough to hold all the vertices
		while (this.currentBitsetSize < result.length) this.currentBitsetSize *= 2;

		for (let i = 0; i < result.length; i++) {
			this.topoSortedIndex.set(result[i], i);
			this.reachablePredecessors.set(result[i], new BitSet(this.currentBitsetSize));
			for (const dep of this.vertices.get(result[i])?.dependencies || []) {
				const depReachable = this.reachablePredecessors.get(dep);
				depReachable?.set(this.topoSortedIndex.get(dep) || 0, true);
				if (depReachable) {
					const reachable = this.reachablePredecessors.get(result[i]);
					this.reachablePredecessors.set(result[i], reachable?.or(depReachable) || depReachable);
				}
			}
		}

		this.arePredecessorsFresh = true;
		return result;
	}

	linearizeVertices(
		origin: Hash = HashGraph.rootHash,
		subgraph: ObjectSet<string> = new ObjectSet(this.vertices.keys())
	): Vertex[] {
		switch (this.semanticsTypeDRP) {
			case SemanticsType.pair:
				return linearizePairSemantics(this, origin, subgraph);
			case SemanticsType.multiple:
				return linearizeMultipleSemantics(this, origin, subgraph);
			default:
				return [];
		}
	}

	lowestCommonAncestorMultipleVertices(hashes: Hash[], visited: ObjectSet<Hash>): Hash {
		if (hashes.length === 0) {
			throw new Error("Vertex dependencies are empty");
		}
		if (hashes.length === 1) {
			visited.add(hashes[0]);
			return hashes[0];
		}
		let lca: Hash | undefined = hashes[0];
		const targetVertices: Hash[] = [...hashes];
		for (let i = 1; i < targetVertices.length; i++) {
			if (!lca) {
				throw new Error("LCA not found");
			}
			if (!visited.has(targetVertices[i])) {
				lca = this.lowestCommonAncestorPairVertices(lca, targetVertices[i], visited, targetVertices);
			}
		}
		if (!lca) {
			throw new Error("LCA not found");
		}
		return lca;
	}

	private lowestCommonAncestorPairVertices(
		hash1: Hash,
		hash2: Hash,
		visited: ObjectSet<Hash>,
		targetVertices: Hash[]
	): Hash | undefined {
		let currentHash1 = hash1;
		let currentHash2 = hash2;
		visited.add(currentHash1);
		visited.add(currentHash2);

		while (currentHash1 !== currentHash2) {
			const distance1 = this.vertexDistances.get(currentHash1);
			if (!distance1) {
				this.log.error("::hashgraph::LCA: Vertex not found");
				return;
			}
			const distance2 = this.vertexDistances.get(currentHash2);
			if (!distance2) {
				this.log.error("::hashgraph::LCA: Vertex not found");
				return;
			}

			if (distance1.distance > distance2.distance) {
				if (!distance1.closestDependency) {
					this.log.error("::hashgraph::LCA: Closest dependency not found");
					return;
				}
				for (const dep of this.vertices.get(currentHash1)?.dependencies || []) {
					if (dep !== distance1.closestDependency && !visited.has(dep)) {
						targetVertices.push(dep);
					}
				}
				currentHash1 = distance1.closestDependency;
				if (visited.has(currentHash1)) {
					return currentHash2;
				}
				visited.add(currentHash1);
			} else {
				if (!distance2.closestDependency) {
					this.log.error("::hashgraph::LCA: Closest dependency not found");
					return;
				}
				for (const dep of this.vertices.get(currentHash2)?.dependencies || []) {
					if (dep !== distance2.closestDependency && !visited.has(dep)) {
						targetVertices.push(dep);
					}
				}
				currentHash2 = distance2.closestDependency;
				if (visited.has(currentHash2)) {
					return currentHash1;
				}
				visited.add(currentHash2);
			}
		}
		return currentHash1;
	}

	areCausallyRelatedUsingBitsets(hash1: Hash, hash2: Hash): boolean {
		if (!this.arePredecessorsFresh) {
			this.topologicalSort(true);
		}
		const test1 = this.reachablePredecessors.get(hash1)?.get(this.topoSortedIndex.get(hash2) || 0) || false;
		const test2 = this.reachablePredecessors.get(hash2)?.get(this.topoSortedIndex.get(hash1) || 0) || false;
		return test1 || test2;
	}

	swapReachablePredecessors(hash1: Hash, hash2: Hash): void {
		const reachable1 = this.reachablePredecessors.get(hash1);
		const reachable2 = this.reachablePredecessors.get(hash2);
		if (!reachable1 || !reachable2) return;
		this.reachablePredecessors.set(hash1, reachable2);
		this.reachablePredecessors.set(hash2, reachable1);
	}

	private _areCausallyRelatedUsingBFS(start: Hash, target: Hash): boolean {
		const visited = new Set<Hash>();
		const queue: Hash[] = [];
		let head = 0;

		queue.push(start);

		while (head < queue.length) {
			const current = queue[head];
			head++;

			if (current === target) return true;
			if (current === undefined) continue;

			visited.add(current);
			const vertex = this.vertices.get(current);
			if (!vertex) continue;

			for (const dep of vertex.dependencies) {
				if (!visited.has(dep)) {
					queue.push(dep);
				}
			}

			if (head > queue.length / 2) {
				queue.splice(0, head);
				head = 0;
			}
		}
		return false;
	}

	areCausallyRelatedUsingBFS(hash1: Hash, hash2: Hash): boolean {
		return this._areCausallyRelatedUsingBFS(hash1, hash2) || this._areCausallyRelatedUsingBFS(hash2, hash1);
	}

	getFrontier(): Hash[] {
		return Array.from(this.frontier);
	}

	getDependencies(vertexHash: Hash): Hash[] {
		return Array.from(this.vertices.get(vertexHash)?.dependencies || []);
	}

	getVertex(hash: Hash): Vertex | undefined {
		return this.vertices.get(hash);
	}

	getAllVertices(): Vertex[] {
		return Array.from(this.vertices.values());
	}

	getReachablePredecessors(hash: Hash): BitSet | undefined {
		return this.reachablePredecessors.get(hash);
	}

	getCurrentBitsetSize(): number {
		return this.currentBitsetSize;
	}
}
