import { type IACL } from "./acl.js";
import { type IDRP } from "./drp.js";
import { type FinalityConfig, type IFinalityStore } from "./finality.js";
import { type LoggerOptions } from "./logger.js";
import { type IMetrics } from "./metrics.js";
import { type DRPObjectBase, type DRPState, type Vertex } from "./proto/drp/v1/object_pb.js";

export interface LowestCommonAncestorResult {
	lca: string;
	linearizedVertices: Vertex[];
}

// snake_casing to match the JSON config
export interface DRPObjectConfig {
	log_config?: LoggerOptions;
	finality_config?: FinalityConfig;
}

export interface DRPObjectOptions<T extends IDRP> {
	peerId: string;
	acl?: IACL;
	drp?: T;
	id?: string;
	config?: DRPObjectConfig;
	metrics?: IMetrics;
}

export type MergeResult = [merged: boolean, missing: string[]];

export interface ApplyResult {
	applied: boolean;
	missing: string[];
}

export type DRPObjectCallback<T extends IDRP> = (object: IDRPObject<T>, origin: string, vertices: Vertex[]) => void;

export interface IDRPObject<T extends IDRP> extends DRPObjectBase {
	/**
	 * The id of the DRP object.
	 */
	readonly id: string;

	/**
	 * The ACL of the DRP object.
	 */
	acl: IACL;

	/**
	 * The DRP of the DRP object.
	 */
	drp?: T;

	/**
	 * The vertices of the DRP object.
	 */
	vertices: Vertex[];

	/**
	 * The finality store of the DRP object.
	 */
	finalityStore: IFinalityStore;

	/**
	 * Get the drp state and the acl state for a given vertex hash.
	 * @param vertexHash - The hash of the vertex to get the state for.
	 * @returns The drp state and the acl state for the given vertex hash.
	 */
	getStates(vertexHash: string): [DRPState | undefined, DRPState | undefined];

	/**
	 * Set the acl state for a given vertex hash.
	 * @param vertexHash - The hash of the vertex to set the state for.
	 * @param aclState - The acl state to set for the given vertex hash.
	 */
	setACLState(vertexHash: string, aclState: DRPState): void;

	/**
	 * Set the drp state for a given vertex hash.
	 * @param vertexHash - The hash of the vertex to set the state for.
	 * @param drpState - The drp state to set for the given vertex hash.
	 */
	setDRPState(vertexHash: string, drpState: DRPState): void;

	/**
	 * Subscribe to the DRP object.
	 * @param callback - The callback to call when the DRP object changes.
	 */
	subscribe(callback: DRPObjectCallback<T>): void;

	/**
	 * Apply the vertices to the DRP object.
	 * @param vertices - The vertices to apply to the DRP object.
	 * @returns The result of the apply.
	 */
	applyVertices(vertices: Vertex[]): Promise<ApplyResult>;

	/**
	 * @deprecated Use applyVertices instead
	 * Merge the vertices into the DRP object.
	 * @param vertices - The vertices to merge into the DRP object.
	 * @returns The result of the merge.
	 */
	merge(vertices: Vertex[]): Promise<MergeResult>;
}

export interface ConnectObjectOptions<T extends IDRP> {
	peerId?: string;
	id?: string;
	drp?: T;
	metrics?: IMetrics;
	log_config?: LoggerOptions;
}

export interface CreateObjectOptions<T extends IDRP> extends ConnectObjectOptions<T> {
	peerId: string;
}
