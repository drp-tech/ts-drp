import { type IACL } from "./acl.js";
import { type DRPIntervalDiscoveryOptions } from "./drp-interval-discovery.js";
import { type IDRP } from "./drp.js";
import { type KeychainOptions } from "./keychain.js";
import { type LoggerOptions } from "./logger.js";
import { type IMetrics } from "./metrics.js";
import { type DRPNetworkNodeConfig } from "./network.js";

export interface DRPNodeConfig {
	log_config?: LoggerOptions;
	network_config?: DRPNetworkNodeConfig;
	keychain_config?: KeychainOptions;
	interval_discovery_options?: Omit<DRPIntervalDiscoveryOptions, "id" | "networkNode">;
}

interface NodeObjectOptionsBase<T> {
	id?: string;
	acl?: IACL;
	drp?: T;
	metrics?: IMetrics;
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
