import { type ACL } from "./acl.js";
import { type DRP } from "./drp.js";
import { type FinalityStore } from "./finality.js";
import { type LoggerOptions } from "./logger.js";
import { type IMetrics } from "./metrics.js";
import {
	type Vertex_Operation as Operation,
	type DRPObjectBase,
	type Vertex,
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
}

export type DRPObjectCallback = (object: DRPObject, origin: string, vertices: Vertex[]) => void;

export type ConnectObjectOptions = {
	peerId: string;
	id?: string;
	drp?: DRP;
	metrics?: IMetrics;
	log_config?: LoggerOptions;
};
