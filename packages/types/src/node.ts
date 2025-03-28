import { type PeerId, type TypedEventTarget } from "@libp2p/interface";

import { type IACL } from "./acl.js";
import { type DRPIntervalDiscoveryOptions } from "./drp-interval-discovery.js";
import { type DRPIntervalReconnectOptions } from "./drp-interval-reconnect.js";
import { type IDRP } from "./drp.js";
import { type IDRPObject } from "./index.js";
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
	id: string;
}

export interface NodeEvents {
	/**
	 * Emitted when a peer receives an fetch message
	 */
	"drp:fetch": CustomEvent<ObjectId>;

	/**
	 * Emitted when a peer responds to a fetch message
	 */
	"drp:fetch:response": CustomEvent<ObjectId>;

	/**
	 * Emitted when a peer receives an update message
	 */
	"drp:update": CustomEvent<ObjectId>;

	/**
	 * Emitted when a peer receives a sync message
	 */
	"drp:sync": CustomEvent<ObjectId>;

	/**
	 * Emitted when a peer receives a sync message with missing objects
	 */
	"drp:sync:missing": CustomEvent<ObjectId>;

	/**
	 * Emitted when a peer accepts a sync message
	 */
	"drp:sync:accepted": CustomEvent<ObjectId>;

	/**
	 * Emitted when a peer rejects a sync message
	 */
	"drp:sync:rejected": CustomEvent<ObjectId>;

	/**
	 * Emitted when a peer receives an update attestation message
	 */
	"drp:attestation:update": CustomEvent<ObjectId>;
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
}
