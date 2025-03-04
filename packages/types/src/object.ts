import { ACL } from "./acl.js";
import { DRP } from "./drp.js";
import { FinalityStore } from "./finality.js";
import { HashGraph } from "./hashgraph.js";
import { LoggerOptions } from "./logger.js";
import { IMetrics } from "./metrics.js";
import {
	Vertex_Operation as Operation,
	DRPObjectBase,
	Vertex,
	DRPState,
} from "./proto/drp/v1/object_pb.js";

export interface LcaAndOperations {
	lca: string;
	linearizedOperations: Operation[];
}

export interface DRPObject extends DRPObjectBase {
	/**
	 * The id of the DRP object.
	 */
	readonly id: string;
	/**
	 * The ACL of the DRP object.
	 */
	acl?: ProxyHandler<ACL>;
	/**
	 * The DRP of the DRP object.
	 */
	drp?: ProxyHandler<DRP>;

	/**
	 * The original DRP of the DRP object.
	 */
	originalDRP?: DRP;
	/**
	 * The original ACL of the DRP object.
	 */
	originalObjectACL?: ACL;
	/**
	 * The finality store of the DRP object.
	 */
	finalityStore: FinalityStore;
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
	hashGraph: HashGraph;

	/**
	 * Subscribe to the DRP object.
	 */
	subscribe(callback: DRPObjectCallback): void;

	/**
	 * Merge the vertices into the DRP object.
	 */
	merge(vertices: Vertex[]): [merged: boolean, missing: string[]];
}

export type DRPObjectCallback = (object: DRPObject, origin: string, vertices: Vertex[]) => void;

export type ConnectObjectOptions = {
	peerId: string;
	id?: string;
	drp?: DRP;
	metrics?: IMetrics;
	log_config?: LoggerOptions;
};
