import { type IACL } from "./acl.js";
import { type IDRP } from "./drp.js";
import { type IFinalityStore } from "./finality.js";
import { type IHashGraph } from "./hashgraph.js";
import { type LoggerOptions } from "./logger.js";
import { type IMetrics } from "./metrics.js";
import { type DRPObjectBase, type DRPState, type Vertex } from "./proto/drp/v1/object_pb.js";

export interface LowestCommonAncestorResult {
	lca: string;
	linearizedVertices: Vertex[];
}

export interface IDRPObject extends DRPObjectBase {
	/**
	 * The id of the DRP object.
	 */
	readonly id: string;
	/**
	 * The ACL of the DRP object.
	 */
	acl?: ProxyHandler<IACL>;
	/**
	 * The DRP of the DRP object.
	 */
	drp?: ProxyHandler<IDRP>;

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
	subscriptions: DRPObjectCallback[];

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
	subscribe(callback: DRPObjectCallback): void;

	/**
	 * Merge the vertices into the DRP object.
	 */
	merge(vertices: Vertex[]): [merged: boolean, missing: string[]];
}

export type DRPObjectCallback = (object: IDRPObject, origin: string, vertices: Vertex[]) => void;

export type ConnectObjectOptions = {
	peerId: string;
	id?: string;
	drp?: IDRP;
	metrics?: IMetrics;
	log_config?: LoggerOptions;
};
