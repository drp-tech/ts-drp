import { type IBitSet } from "./bitset.js";
import { type Vertex_Operation as Operation, type Vertex } from "./proto/drp/v1/object_pb.js";

export type Hash = string;

/**
 * The type of the action.
 */
export enum ActionType {
	/**
	 * No operation.
	 */
	Nop = 0,
	/**
	 * Drop the left vertex.
	 */
	DropLeft = 1,
	/**
	 * Drop the right vertex.
	 */
	DropRight = 2,
	/**
	 * Swap the left and right vertices.
	 */
	Swap = 3,
	/**
	 * Drop the left and right vertices.
	 */
	Drop = 4,
}

/**
 * The type of the semantics.
 */
export enum SemanticsType {
	/**
	 * Pair semantics.
	 */
	pair = 0,
	/**
	 * Multiple semantics.
	 */
	multiple = 1,
}

/**
 * The type of the resolve conflicts.
 *
 * In the case of multi-vertex semantics, we are returning an array of vertices (their hashes) to be reduced.
 */
export interface ResolveConflictsType {
	action: ActionType;
	vertices?: Hash[];
}

export interface IHashGraph {
	peerId: string;
	resolveConflictsACL(vertices: Vertex[]): ResolveConflictsType;
	resolveConflictsDRP(vertices: Vertex[]): ResolveConflictsType;
	semanticsTypeDRP?: SemanticsType;
	vertices: Map<Hash, Vertex>;
	frontier: Hash[];
	forwardEdges: Map<Hash, Hash[]>;

	resolveConflicts(vertices: Vertex[]): ResolveConflictsType;
	createVertex(operation: Operation, dependencies: Hash[], timestamp: number): Vertex;
	addVertex(vertex: Vertex): void;
	areCausallyRelatedUsingBitsets(hash1: Hash, hash2: Hash): boolean;
	swapReachablePredecessors(hash1: Hash, hash2: Hash): void;
	areCausallyRelatedUsingBFS(hash1: Hash, hash2: Hash): boolean;
	getFrontier(): Hash[];
	getDependencies(vertexHash: Hash): Hash[];
	getVertex(hash: Hash): Vertex | undefined;
	getAllVertices(): Vertex[];
	getReachablePredecessors(hash: Hash): IBitSet | undefined;
	getCurrentBitsetSize(): number;
}
