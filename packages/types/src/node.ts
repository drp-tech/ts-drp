import { KeychainOptions } from "./keychain.js";
import { LoggerOptions } from "./logger.js";
import { DRPNetworkNodeConfig } from "./network.js";

export interface DRPNodeConfig {
	log_config?: LoggerOptions;
	network_config?: DRPNetworkNodeConfig;
	keychain_config?: KeychainOptions;
}
