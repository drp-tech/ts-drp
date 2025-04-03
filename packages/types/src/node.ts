import { type PeerId, type TypedEventTarget } from "@libp2p/interface";

import { type IACL } from "./acl.js";
import { type DRPIntervalDiscoveryOptions } from "./drp-interval-discovery.js";
import { type DRPIntervalReconnectOptions } from "./drp-interval-reconnect.js";
import { type IDRP } from "./drp.js";
import {
	type FetchState,
	type FetchStateResponse,
	type IDRPObject,
	type NodeEventName,
	type Update,
	type Vertex,
} from "./index.js";
import { type KeychainOptions } from "./keychain.js";
import { type LoggerOptions } from "./logger.js";
import { type IMetrics } from "./metrics.js";
import { type DRPNetworkNode, type DRPNetworkNodeConfig } from "./network.js";

export interface DRPNodeConfig {
	log_config?: LoggerOptions;
	network_config?: DRPNetworkNodeConfig;
	keychain_config?: KeychainOptions;
	interval_discovery_options?: Omit<DRPIntervalDiscoveryOptions, "id" | "networkNode">;
	interval_reconnect_options?: Omit<DRPIntervalReconnectOptions, "id" | "networkNode">;
}

interface NodeObjectOptionsBase<T> {
	id?: string;
	acl?: IACL;
	drp?: T;
	metrics?: IMetrics;
	log_config?: LoggerOptions;
}

export interface NodeCreateObjectOptions<T extends IDRP> extends NodeObjectOptionsBase<T> {
	sync?: {
		enabled: boolean;
		peerId?: string;
	};
}

export interface NodeConnectObjectOptions<T extends IDRP> extends NodeObjectOptionsBase<T> {
	id: string;
	sync?: {
		peerId?: string;
	};
}

export interface PeerInfo {
	/**
	 * The identifier of the remote peer
	 */
	id: PeerId;
}

export interface ObjectId {
	/**
	 * The identifier of the object
	 */
	id: string;
}

export interface FetchStateEvent extends ObjectId {
	/**
	 * The identifier of the remote peer
	 */
	fetchState: FetchState;
}

export interface FetchStateResponseEvent extends ObjectId {
	/**
	 * FetchStateResponse
	 */
	fetchStateResponse: FetchStateResponse;
}

export interface RequestSyncEvent extends ObjectId {
	/**
	 * Requested vertices
	 */
	requested: Vertex[];

	/**
	 * Requesting hash
	 */
	requesting: string[];
}

export interface UpdateObjectEvent extends ObjectId {
	/**
	 * Updated vertices
	 */
	update: Update;
}

export interface NodeEvents {
	/**
	 * Emitted when a peer receives an fetch message
	 */
	[NodeEventName.DRP_FETCH_STATE]: CustomEvent<FetchStateEvent>;

	/**
	 * Emitted when a peer responds to a fetch message
	 */
	[NodeEventName.DRP_FETCH_STATE_RESPONSE]: CustomEvent<FetchStateResponseEvent>;

	/**
	 * Emitted when a peer receives an update message
	 */
	[NodeEventName.DRP_UPDATE]: CustomEvent<UpdateObjectEvent>;

	/**
	 * Emitted when a peer receives a sync message
	 */
	[NodeEventName.DRP_SYNC]: CustomEvent<RequestSyncEvent>;

	/**
	 * Emitted when a peer receives a sync message with missing objects
	 */
	[NodeEventName.DRP_SYNC_MISSING]: CustomEvent<RequestSyncEvent>;

	/**
	 * Emitted when a peer accepts a sync message
	 */
	[NodeEventName.DRP_SYNC_ACCEPTED]: CustomEvent<ObjectId>;

	/**
	 * Emitted when a peer rejects a sync message
	 */
	[NodeEventName.DRP_SYNC_REJECTED]: CustomEvent<ObjectId>;

	/**
	 * Emitted when a peer receives an update attestation message
	 */
	[NodeEventName.DRP_ATTESTATION_UPDATE]: CustomEvent<ObjectId>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DRPObjectSubscribeCallback<T extends IDRP = any> {
	(objectId: string, object: IDRPObject<T>): void;
}

export interface IDRPNode extends TypedEventTarget<NodeEvents> {
	/**
	 * The configuration of the node
	 */
	config: DRPNodeConfig;

	/**
	 * The network node
	 */
	networkNode: DRPNetworkNode;

	/**
	 * Start the node
	 */
	start(): Promise<void>;

	/**
	 * Stop the node
	 */
	stop(): Promise<void>;

	/**
	 * Restart the node
	 * @param config
	 */
	restart(config?: DRPNodeConfig): Promise<void>;

	/**
	 * Create a new object
	 * @param options
	 */
	createObject<T extends IDRP>(options: NodeCreateObjectOptions<T>): Promise<IDRPObject<T>>;

	/**
	 * Get an object by id
	 * @param id The id of the object
	 */
	get<T extends IDRP>(id: string): IDRPObject<T> | undefined;

	/**
	 * Connect to an object
	 * @param id The id of the object
	 * @param object The object
	 */
	put<T extends IDRP>(id: string, object: IDRPObject<T>): void;

	/**
	 * Subscribe to an object
	 * @param id The id of the object
	 * @param callback The callback to call when the object changes
	 */
	subscribe<T extends IDRP>(id: string, callback: DRPObjectSubscribeCallback<T>): void;
}
