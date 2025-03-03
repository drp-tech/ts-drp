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
