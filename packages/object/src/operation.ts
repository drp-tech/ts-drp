import { type IACL, type IDRP, type LowestCommonAncestorResult, type Vertex } from "@ts-drp/types";

export interface BaseOperation {
	/**
	 * the type of the operation
	 */
	isACL: boolean;

	/**
	 * the vertex that is being applied
	 */
	vertex: Vertex;
}

export interface PostLCAOperation extends BaseOperation {
	/**
	 * the lca of the vertex
	 */
	lcaResult: LowestCommonAncestorResult;
}

export interface PostSplitOperation extends PostLCAOperation {
	drpVertices: Vertex[];
	aclVertices: Vertex[];
}

export interface Operation<T extends IDRP> extends PostSplitOperation {
	acl: IACL;
	drp?: T;

	/**
	 * the current state of the drp this is cloned from the drp if we are treating a drp operation
	 */
	currentDRP?: T | IACL;
}

export interface PostOperation<T extends IDRP> extends Operation<T> {
	result: unknown;
}
