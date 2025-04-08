import { type ResolveConflictsType, type SemanticsType } from "./hashgraph.js";
import { type Vertex } from "./proto/drp/v1/object_pb.js";

export interface ResolveConflictFn {
	(vertices: Vertex[]): ResolveConflictsType;
}

/**
 * The type of the DRP object.
 */
export enum DrpType {
	/**
	 * The type of the DRP object.
	 */
	ACL = "ACL",
	/**
	 * The type of the DRP object.
	 */
	DRP = "DRP",
}

/**
 * The context metadata for a request.
 */
export interface DrpRuntimeContext {
	/**
	 * The peer that initiated the request.
	 */
	caller: string;
}

export interface IDRP {
	/**
	 * The semantics type of the DRP.
	 */
	semanticsType: SemanticsType;
	/**
	 * The context metadata for a request.
	 */
	context?: DrpRuntimeContext;
	/**
	 * The resolve conflicts function of the DRP.
	 * @param vertices - The vertices to resolve conflicts from.
	 */
	resolveConflicts?: ResolveConflictFn;
	/**
	 * The properties of the DRP.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}
