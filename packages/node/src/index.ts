import { createDRPDiscovery } from "@ts-drp/interval-discovery";
import { createDRPReconnectBootstrap } from "@ts-drp/interval-reconnect";
import { Keychain } from "@ts-drp/keychain";
import { Logger } from "@ts-drp/logger";
import { MessageQueueManager } from "@ts-drp/message-queue";
import { DRPNetworkNode } from "@ts-drp/network";
import { DRPObject } from "@ts-drp/object";
import {
	DRPDiscoveryResponse,
	type DRPNodeConfig,
	type IDRP,
	type IDRPObject,
	type IntervalRunnerMap,
	Message,
	MessageType,
	type NodeConnectObjectOptions,
	type NodeCreateObjectOptions,
} from "@ts-drp/types";

import { loadConfig } from "./config.js";
import { drpObjectChangesHandler, handleMessage } from "./handlers.js";
import { log } from "./logger.js";
import * as operations from "./operations.js";
import { DRPObjectStore } from "./store/index.js";

export { loadConfig };

const DISCOVERY_MESSAGE_TYPES = [
	MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
	MessageType.MESSAGE_TYPE_DRP_DISCOVERY_RESPONSE,
];

const DISCOVERY_QUEUE_ID = "discovery";

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
		this.messageQueueManager = new MessageQueueManager<Message>({ logConfig: this.config.log_config });
	}

	async start(): Promise<void> {
		await this.keychain.start();
		await this.networkNode.start(this.keychain.secp256k1PrivateKey);
		this._intervals.set(
			"interval::reconnect",
			createDRPReconnectBootstrap({
				...this.config.interval_reconnect_options,
				id: this.networkNode.peerId.toString(),
				networkNode: this.networkNode,
				logConfig: this.config.log_config,
			})
		);
		this.networkNode.subscribeToMessageQueue(this.dispatchMessage.bind(this));
		this.messageQueueManager.subscribe(DISCOVERY_QUEUE_ID, (msg) => handleMessage(this, msg));
		this._intervals.forEach((interval) => interval.start());
	}

	async stop(): Promise<void> {
		await this.networkNode.stop();
		void this.messageQueueManager.closeAll();
		this._intervals.forEach((interval) => interval.stop());
	}

	async restart(config?: DRPNodeConfig): Promise<void> {
		await this.stop();

		// reassign the network node ? I think we might not need to do this
		this.networkNode = new DRPNetworkNode(config ? config.network_config : this.config?.network_config);

		await this.start();
		log.info("::restart: Node restarted");
	}

	async dispatchMessage(msg: Message): Promise<void> {
		if (DISCOVERY_MESSAGE_TYPES.includes(msg.type)) {
			await this.messageQueueManager.enqueue(DISCOVERY_QUEUE_ID, msg);
			return;
		}

		await this.messageQueueManager.enqueue(msg.objectId, msg);
	}

	addCustomGroup(group: string): void {
		this.networkNode.subscribe(group);
	}

	async sendGroupMessage(group: string, data: Uint8Array): Promise<void> {
		const message = Message.create({
			sender: this.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_CUSTOM,
			data,
		});
		await this.networkNode.broadcastMessage(group, message);
	}

	async sendCustomMessage(peerId: string, data: Uint8Array): Promise<void> {
		const message = Message.create({
			sender: this.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_CUSTOM,
			data,
		});
		await this.networkNode.sendMessage(peerId, message);
	}

	async createObject<T extends IDRP>(options: NodeCreateObjectOptions<T>): Promise<DRPObject<T>> {
		const object = new DRPObject<T>({
			peerId: this.networkNode.peerId,
			acl: options.acl,
			drp: options.drp,
			id: options.id,
			metrics: options.metrics,
			config: {
				log_config: options.log_config,
			},
		});

		// put the object in the object store
		this.objectStore.put(object.id, object);

		// subscribe to the object
		this.subscribeObject(object);

		// sync the object
		if (options.sync?.enabled) {
			await operations.syncObject(this, object.id, options.sync.peerId);
		}
		// create the interval discovery
		this._createIntervalDiscovery(object.id);
		return object;
	}

	/**
	 * Connect to an existing object
	 * @param options.id - The object ID
	 * @param options.drp - The DRP instance. It can be undefined where we just want the HG state
	 * @param options.sync.peerId - The peer ID to sync with
	 */
	async connectObject<T extends IDRP>(options: NodeConnectObjectOptions<T>): Promise<IDRPObject<T>> {
		const object = DRPObject.createObject({
			peerId: this.networkNode.peerId,
			id: options.id,
			drp: options.drp,
			metrics: options.metrics,
			log_config: options.log_config,
		});

		// put the object in the object store
		this.objectStore.put(object.id, object);

		this.subscribeObject(object);

		// start the interval discovery
		this._createIntervalDiscovery(options.id);

		await operations.fetchState(this, options.id, options.sync?.peerId);

		// TODO: since when the interval can run this twice do we really want it to be
		// runned while the other one might still be running?
		const intervalFn = (interval: NodeJS.Timeout) => async (): Promise<void> => {
			if (object.acl) {
				await operations.syncObject(this, object.id, options.sync?.peerId);
				log.info("::connectObject: Synced object", object.id);
				log.info("::connectObject: Subscribed to object", object.id);
				clearInterval(interval);
			}
		};
		const retry = setInterval(() => void intervalFn(retry)(), 1000);

		return object;
	}

	subscribeObject<T extends IDRP>(object: DRPObject<T>): void {
		// subscribe to the object
		object.subscribe((obj, originFn, vertices) => drpObjectChangesHandler(this, obj, originFn, vertices));
		// subscribe to the topic in gossipsub
		this.networkNode.subscribe(object.id);
		// subscribe the the message Queue
		this.messageQueueManager.subscribe(object.id, (msg) => handleMessage(this, msg));
	}

	unsubscribeObject(id: string, purge?: boolean): void {
		this.networkNode.unsubscribe(id);
		if (purge) this.objectStore.remove(id);
		this.networkNode.removeTopicScoreParams(id);
		this.messageQueueManager.close(id);
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
				logConfig: this.config.log_config,
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
