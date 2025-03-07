import type { GossipsubMessage } from "@chainsafe/libp2p-gossipsub";
import type { EventCallback, IncomingStreamData, StreamHandler } from "@libp2p/interface";
import { Keychain } from "@ts-drp/keychain";
import { Logger } from "@ts-drp/logger";
import { DRPNetworkNode } from "@ts-drp/network";
import { DRPObject } from "@ts-drp/object";
import {
	type IMetrics,
	type DRPNodeConfig,
	Message,
	MessageType,
	type IACL,
	type IDRP,
	type IDRPObject,
} from "@ts-drp/types";

import { loadConfig } from "./config.js";
import { drpMessagesHandler } from "./handlers.js";
import { log } from "./logger.js";
import * as operations from "./operations.js";
import { DRPObjectStore } from "./store/index.js";

export { loadConfig };

export class DRPNode {
	config?: DRPNodeConfig;
	objectStore: DRPObjectStore;
	networkNode: DRPNetworkNode;
	keychain: Keychain;

	constructor(config?: DRPNodeConfig) {
		this.config = config;
		const newLogger = new Logger("drp::node", config?.log_config);
		log.trace = newLogger.trace;
		log.debug = newLogger.debug;
		log.info = newLogger.info;
		log.warn = newLogger.warn;
		log.error = newLogger.error;
		this.networkNode = new DRPNetworkNode(config?.network_config);
		this.objectStore = new DRPObjectStore();
		this.keychain = new Keychain(config?.keychain_config);
	}

	async start(): Promise<void> {
		await this.keychain.start();
		await this.networkNode.start(this.keychain.secp256k1PrivateKey);
		await this.networkNode.addMessageHandler(
			({ stream }: IncomingStreamData) => void drpMessagesHandler(this, stream)
		);
	}

	async restart(config?: DRPNodeConfig): Promise<void> {
		await this.networkNode.stop();
		this.networkNode = new DRPNetworkNode(
			config ? config.network_config : this.config?.network_config
		);
		await this.start();
		log.info("::restart: Node restarted");
	}

	addCustomGroup(group: string): void {
		this.networkNode.subscribe(group);
	}

	addCustomGroupMessageHandler(
		group: string,
		handler: EventCallback<CustomEvent<GossipsubMessage>>
	): void {
		this.networkNode.addGroupMessageHandler(group, handler);
	}

	async sendGroupMessage(group: string, data: Uint8Array): Promise<void> {
		const message = Message.create({
			sender: this.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_CUSTOM,
			data,
		});
		await this.networkNode.broadcastMessage(group, message);
	}

	async addCustomMessageHandler(
		protocol: string | string[],
		handler: StreamHandler
	): Promise<void> {
		await this.networkNode.addCustomMessageHandler(protocol, handler);
	}

	async sendCustomMessage(peerId: string, data: Uint8Array): Promise<void> {
		const message = Message.create({
			sender: this.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_CUSTOM,
			data,
		});
		await this.networkNode.sendMessage(peerId, message);
	}

	async createObject(options: {
		drp?: IDRP;
		acl?: IACL;
		id?: string;
		sync?: {
			enabled: boolean;
			peerId?: string;
		};
		metrics?: IMetrics;
	}): Promise<DRPObject> {
		const object = new DRPObject({
			peerId: this.networkNode.peerId,
			publicCredential: options.acl ? undefined : this.keychain.getPublicCredential(),
			acl: options.acl,
			drp: options.drp,
			id: options.id,
			metrics: options.metrics,
		});
		operations.createObject(this, object);
		operations.subscribeObject(this, object.id);
		if (options.sync?.enabled) {
			await operations.syncObject(this, object.id, options.sync.peerId);
		}
		return object;
	}

	/*
		Connect to an existing object
		@param options.id - The object ID
		@param options.drp - The DRP instance. It can be undefined
			where we just want the HG state
		@param options.sync.peerId - The peer ID to sync with
	*/
	async connectObject(options: {
		id: string;
		drp?: IDRP;
		sync?: {
			peerId?: string;
		};
		metrics?: IMetrics;
	}): Promise<IDRPObject> {
		const object = await operations.connectObject(this, options.id, {
			peerId: options.sync?.peerId,
			drp: options.drp,
			metrics: options.metrics,
		});
		return object;
	}

	subscribeObject(id: string): void {
		operations.subscribeObject(this, id);
	}

	unsubscribeObject(id: string, purge?: boolean): void {
		operations.unsubscribeObject(this, id, purge);
		this.networkNode.removeTopicScoreParams(id);
	}

	async syncObject(id: string, peerId?: string): Promise<void> {
		await operations.syncObject(this, id, peerId);
	}
}
