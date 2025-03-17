import type { GossipsubMessage } from "@chainsafe/libp2p-gossipsub";
import type { EventCallback, IncomingStreamData, StreamHandler } from "@libp2p/interface";
import { createDRPDiscovery } from "@ts-drp/interval-discovery";
import { Keychain } from "@ts-drp/keychain";
import { Logger } from "@ts-drp/logger";
import { GENERAL_QUEUE_ID, MessageQueueManager } from "@ts-drp/message-queue";
import { DRPNetworkNode } from "@ts-drp/network";
import { DRPObject } from "@ts-drp/object";
import {
	DRP_DISCOVERY_TOPIC,
	DRPDiscoveryResponse,
	type DRPNodeConfig,
	type IACL,
	type IDRP,
	type IDRPObject,
	type IMetrics,
	type IntervalRunnerMap,
	Message,
	MessageType,
} from "@ts-drp/types";

import { loadConfig } from "./config.js";
import {
	gossipSubHandler,
	listenForMessages,
	protocolHandler,
	stopListeningForMessages,
} from "./handlers.js";
import { log } from "./logger.js";
import * as operations from "./operations.js";
import { DRPObjectStore } from "./store/index.js";

export { loadConfig };

export class DRPNode {
	config: DRPNodeConfig;
	objectStore: DRPObjectStore;
	networkNode: DRPNetworkNode;
	keychain: Keychain;
	messageQueueManager: MessageQueueManager<Message>;

	private _intervals: Map<string, IntervalRunnerMap[keyof IntervalRunnerMap]> = new Map();

	constructor(config?: DRPNodeConfig) {
		const newLogger = new Logger("drp::node", config?.log_config);
		log.trace = newLogger.trace;
		log.debug = newLogger.debug;
		log.info = newLogger.info;
		log.warn = newLogger.warn;
		log.error = newLogger.error;
		this.networkNode = new DRPNetworkNode(config?.network_config);
		this.objectStore = new DRPObjectStore();
		this.keychain = new Keychain(config?.keychain_config);
		this.config = {
			...config,
			interval_discovery_options: {
				...config?.interval_discovery_options,
			},
		};
		this.messageQueueManager = new MessageQueueManager<Message>();
	}

	async start(): Promise<void> {
		await this.keychain.start();
		await this.networkNode.start(this.keychain.secp256k1PrivateKey);
		await this.networkNode.addMessageHandler(
			({ stream }: IncomingStreamData) => void protocolHandler(this, stream)
		);
		this.networkNode.addGroupMessageHandler(
			DRP_DISCOVERY_TOPIC,
			(e: CustomEvent<GossipsubMessage>) => void gossipSubHandler(this, e.detail.msg.data)
		);

		await listenForMessages(this, GENERAL_QUEUE_ID);
		this._intervals.forEach((interval) => interval.start());
	}

	async stop(): Promise<void> {
		await this.networkNode.stop();
		this._intervals.forEach((interval) => interval.stop());
	}

	async restart(config?: DRPNodeConfig): Promise<void> {
		await this.stop();

		// reassign the network node ? I think we might not need to do this
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
		this._createIntervalDiscovery(object.id);
		await listenForMessages(this, object.id);
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
		this._createIntervalDiscovery(options.id);
		await listenForMessages(this, options.id);
		return object;
	}

	async subscribeObject(id: string): Promise<void> {
		operations.subscribeObject(this, id);
		await listenForMessages(this, id);
	}

	async unsubscribeObject(id: string, purge?: boolean): Promise<void> {
		operations.unsubscribeObject(this, id, purge);
		this.networkNode.removeTopicScoreParams(id);
		await stopListeningForMessages(this, id);
	}

	async syncObject(id: string, peerId?: string): Promise<void> {
		await operations.syncObject(this, id, peerId);
	}

	private _createIntervalDiscovery(id: string): void {
		const existingInterval = this._intervals.get(id);
		existingInterval?.stop(); // Stop only if it exists

		const interval =
			existingInterval ??
			createDRPDiscovery({
				...this.config.interval_discovery_options,
				id,
				networkNode: this.networkNode,
			});

		this._intervals.set(id, interval);
		interval.start();
	}

	async handleDiscoveryResponse(sender: string, message: Message): Promise<void> {
		const response = DRPDiscoveryResponse.decode(message.data);
		const objectId = message.objectId;
		const interval = this._intervals.get(objectId);
		if (!interval) {
			log.error("::handleDiscoveryResponse: Object not found");
			return;
		}
		if (interval.type !== "interval:discovery") {
			log.error("::handleDiscoveryResponse: Invalid interval type");
			return;
		}
		await interval.handleDiscoveryResponse(sender, response.subscribers);
	}
}
