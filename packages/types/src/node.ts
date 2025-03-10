import { type KeychainOptions } from "./keychain.js";
import { type LoggerOptions } from "./logger.js";
import { type IMessageQueueOptions } from "./message-queue.js";
import { type DRPNetworkNodeConfig } from "./network.js";

export interface DRPNodeConfig {
	log_config?: LoggerOptions;
	network_config?: DRPNetworkNodeConfig;
	keychain_config?: KeychainOptions;
	message_queue_options?: IMessageQueueOptions;
}
