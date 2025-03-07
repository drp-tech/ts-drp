import { type IACL } from "./acl.js";
import { type DRPPublicCredential } from "./credentials.js";
import { type IDRP } from "./drp.js";
import { type IFinalityStore, type FinalityConfig } from "./finality.js";
import { type IHashGraph } from "./hashgraph.js";
import { type LoggerOptions } from "./logger.js";
import { type IMetrics } from "./metrics.js";
import {
	type Vertex_Operation as Operation,
	type DRPObjectBase,
	type Vertex,
	type DRPState,
} from "./proto/drp/v1/object_pb.js";

// snake_casing to match the JSON config
export interface DRPObjectConfig {
	log_config?: LoggerOptions;
	finality_config?: FinalityConfig;
}

export interface DRPObjectOptions<T extends IDRP> {
	peerId: string;
	publicCredential?: DRPPublicCredential;
	acl?: IACL;
	drp?: T;
	id?: string;
	config?: DRPObjectConfig;
	metrics?: IMetrics;
}

export interface LcaAndOperations {
	lca: string;
	linearizedOperations: Operation[];
}

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
	 * The original DRP of the DRP object.
	 */
	originalDRP?: IDRP;
	/**
	 * The original ACL of the DRP object.
	 */
	originalObjectACL?: IACL;
	/**
	 * The finality store of the DRP object.
	 */
	finalityStore: IFinalityStore;
	/**
	 * The subscriptions of the DRP object.
	 */
	subscriptions: DRPObjectCallback<T>[];

	/**
	 * The DRP states of the DRP object.
	 */
	drpStates: Map<string, DRPState>;
	/**
	 * The ACL states of the DRP object.
	 */
	aclStates: Map<string, DRPState>;

	/**
	 * The hash graph of the DRP object.
	 */
	hashGraph: IHashGraph;

	/**
	 * Subscribe to the DRP object.
	 */
	subscribe(callback: DRPObjectCallback<T>): void;

	/**
	 * Merge the vertices into the DRP object.
	 */
	merge(vertices: Vertex[]): [merged: boolean, missing: string[]];
}

export type DRPObjectCallback<T extends IDRP> = (
	object: IDRPObject<T>,
	origin: string,
	vertices: Vertex[]
) => void;

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
