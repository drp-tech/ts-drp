import { type LoggerOptions } from "./logger.js";

export interface DRPNetworkNodeConfig {
	announce_addresses?: string[];
	bootstrap?: boolean;
	bootstrap_peers?: string[];
	browser_metrics?: boolean;
	listen_addresses?: string[];
	log_config?: LoggerOptions;
	pubsub?: {
		peer_discovery_interval?: number;
	};
}
