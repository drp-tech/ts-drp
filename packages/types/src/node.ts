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

interface NodeObjectOptionsBase {
	id?: string;
	acl?: IACL;
	drp?: IDRP;
	metrics?: IMetrics;
	log_config?: LoggerOptions;
}

export interface NodeCreateObjectOptions extends NodeObjectOptionsBase {
	sync?: {
		enabled: boolean;
		peerId?: string;
	};
}

export interface NodeConnectObjectOptions extends NodeObjectOptionsBase {
	id: string;
	sync?: {
		peerId?: string;
	};
}
