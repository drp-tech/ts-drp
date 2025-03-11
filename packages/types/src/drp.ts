import { type ResolveConflictsType, type SemanticsType } from "./hashgraph.js";
import { type Vertex } from "./proto/drp/v1/object_pb.js";

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

export interface IDRP {
	/**
	 * The semantics type of the DRP.
	 */
	semanticsType: SemanticsType;
	/**
	 * The resolve conflicts function of the DRP.
	 *
	 * @param vertices - The vertices to resolve conflicts from.
	 */
	resolveConflicts?(vertices: Vertex[]): ResolveConflictsType;
	/**
	 * The properties of the DRP.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}
