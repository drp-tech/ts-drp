import { TypedEventEmitter } from "@libp2p/interface";
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
	type DRPObjectSubscribeCallback,
	type IDRP,
	type IDRPNode,
	type IDRPObject,
	type IntervalRunnerMap,
	Message,
	MessageType,
	type NodeConnectObjectOptions,
	type NodeCreateObjectOptions,
	type NodeEvents,
} from "@ts-drp/types";
import { NodeConnectObjectOptionsSchema, NodeCreateObjectOptionsSchema } from "@ts-drp/validation";
import { DRPValidationError } from "@ts-drp/validation/errors";

import { drpObjectChangesHandler, handleMessage } from "./handlers.js";
import { log } from "./logger.js";
import * as operations from "./operations.js";
import { DRPObjectStore } from "./store/index.js";

const DISCOVERY_MESSAGE_TYPES = [
	MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
	MessageType.MESSAGE_TYPE_DRP_DISCOVERY_RESPONSE,
];

const DISCOVERY_QUEUE_ID = "discovery";

/**
 * A DRP node.
 */
export class DRPNode extends TypedEventEmitter<NodeEvents> implements IDRPNode {
	config: DRPNodeConfig;
	networkNode: DRPNetworkNode;
	keychain: Keychain;
	messageQueueManager: MessageQueueManager<Message>;

	#objectStore: DRPObjectStore;
	private _intervals: Map<string, IntervalRunnerMap[keyof IntervalRunnerMap]> = new Map();

	/**
	 * Create a new DRP node.
	 * @param config - The configuration for the node.
	 */
	constructor(config?: DRPNodeConfig) {
		super();
		const newLogger = new Logger("drp::node", config?.log_config);
		log.trace = newLogger.trace;
		log.debug = newLogger.debug;
		log.info = newLogger.info;
		log.warn = newLogger.warn;
		log.error = newLogger.error;
		this.networkNode = new DRPNetworkNode(config?.network_config);
		this.#objectStore = new DRPObjectStore();
		this.keychain = new Keychain(config?.keychain_config);
		this.config = {
			...config,
			interval_discovery_options: {
				...config?.interval_discovery_options,
			},
		};
		this.messageQueueManager = new MessageQueueManager<Message>({
			logConfig: this.config.log_config,
		});
	}

	/**
	 * Start the node.
	 */
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

	/**
	 * Stop the node.
	 */
	async stop(): Promise<void> {
		await this.networkNode.stop();
		void this.messageQueueManager.closeAll();
		this._intervals.forEach((interval) => interval.stop());
	}

	/**
	 * Restart the node.
	 */
	async restart(): Promise<void> {
		await this.stop();

		// reassign the network node ? I think we might not need to do this
		this.networkNode = new DRPNetworkNode(this.config?.network_config);

		await this.start();
		log.info("::restart: Node restarted");
	}

	/**
	 * Dispatch a message.
	 * @param msg - The message to dispatch.
	 */
	async dispatchMessage(msg: Message): Promise<void> {
		if (DISCOVERY_MESSAGE_TYPES.includes(msg.type)) {
			await this.messageQueueManager.enqueue(DISCOVERY_QUEUE_ID, msg);
			return;
		}

		await this.messageQueueManager.enqueue(msg.objectId, msg);
	}

	/**
	 * Add a custom group.
	 * @param group - The group to add.
	 */
	addCustomGroup(group: string): void {
		this.networkNode.subscribe(group);
	}

	/**
	 * Send a message to a group.
	 * @param group - The group to send the message to.
	 * @param data - The data to send.
	 */
	async sendGroupMessage(group: string, data: Uint8Array): Promise<void> {
		const message = Message.create({
			sender: this.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_CUSTOM,
			data,
		});
		await this.networkNode.broadcastMessage(group, message);
	}

	/**
	 * Send a message to a peer.
	 * @param peerId - The peer to send the message to.
	 * @param data - The data to send.
	 */
	async sendCustomMessage(peerId: string, data: Uint8Array): Promise<void> {
		const message = Message.create({
			sender: this.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_CUSTOM,
			data,
		});
		await this.networkNode.sendMessage(peerId, message);
	}

	/**
	 * Get an object by id
	 * @param id The id of the object
	 * @returns The object, or undefined if it does not exist
	 */
	get<T extends IDRP>(id: string): IDRPObject<T> | undefined {
		return this.#objectStore.get(id);
	}

	/**
	 * Put an object into the store.
	 * @param id The id of the object
	 * @param object The object
	 */
	put<T extends IDRP>(id: string, object: IDRPObject<T>): void {
		this.#objectStore.put(id, object);
	}

	/**
	 * Subscribe to an object.
	 * @param id The id of the object
	 * @param callback The callback to call when the object changes
	 */
	subscribe<T extends IDRP>(id: string, callback: DRPObjectSubscribeCallback<T>): void {
		this.#objectStore.subscribe(id, callback);
	}

	/**
	 * Create an object.
	 * @param options - The options for the object.
	 * @returns The created object.
	 */
	async createObject<T extends IDRP>(options: NodeCreateObjectOptions<T>): Promise<DRPObject<T>> {
		if (this.networkNode.peerId === "") {
			throw new Error("Node not started");
		}
		const validation = NodeCreateObjectOptionsSchema.safeParse(options);
		if (!validation.success) {
			throw new DRPValidationError(validation.error);
		}

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
		this.#objectStore.put(object.id, object);

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
	 * @param options - The options for the object.
	 * @returns The connected object.
	 */
	async connectObject<T extends IDRP>(options: NodeConnectObjectOptions<T>): Promise<IDRPObject<T>> {
		if (this.networkNode.peerId === "") {
			throw new Error("Node not started");
		}
		const validation = NodeConnectObjectOptionsSchema.safeParse(options);
		if (!validation.success) {
			throw new DRPValidationError(validation.error);
		}
		const object = DRPObject.createObject({
			peerId: this.networkNode.peerId,
			id: options.id,
			drp: options.drp,
			metrics: options.metrics,
			log_config: options.log_config,
		});

		// put the object in the object store
		this.#objectStore.put(object.id, object);

		this.subscribeObject(object);

		// start the interval discovery
		this._createIntervalDiscovery(options.id);

		await operations.fetchState(this, options.id, options.sync?.peerId);

		// TODO: since when the interval can run this twice do we really want it to be
		// run while the other one might still be running?
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

	/**
	 * Subscribe to an object.
	 * @param object - The object to subscribe to.
	 */
	subscribeObject<T extends IDRP>(object: DRPObject<T>): void {
		// subscribe to the object
		object.subscribe((obj, originFn, vertices) => drpObjectChangesHandler(this, obj, originFn, vertices));
		// subscribe to the topic in gossipsub
		this.networkNode.subscribe(object.id);
		// subscribe the the message Queue
		this.messageQueueManager.subscribe(object.id, (msg) => handleMessage(this, msg));
	}

	/**
	 * Unsubscribe from an object.
	 * @param id - The object ID.
	 * @param purge - Whether to purge the object.
	 */
	unsubscribeObject(id: string, purge?: boolean): void {
		this.networkNode.unsubscribe(id);
		if (purge) this.#objectStore.remove(id);
		this.networkNode.removeTopicScoreParams(id);
		this.messageQueueManager.close(id);
	}

	/**
	 * Sync an object.
	 * @param id - The object ID.
	 * @param peerId - The peer ID to sync with.
	 */
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

	/**
	 * Handle a discovery response.
	 * @param sender - The sender of the message.
	 * @param message - The message to handle.
	 */
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
