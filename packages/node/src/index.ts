import type { GossipsubMessage } from "@chainsafe/libp2p-gossipsub";
import type { EventCallback, IncomingStreamData, StreamHandler } from "@libp2p/interface";
import { createDRPDiscovery } from "@ts-drp/interval-discovery";
import { createDRPReconnectBootstrap } from "@ts-drp/interval-reconnect";
import { Keychain } from "@ts-drp/keychain";
import { Logger } from "@ts-drp/logger";
import { DRPNetworkNode } from "@ts-drp/network";
import { DRPObject } from "@ts-drp/object";
import {
	DRP_INTERVAL_DISCOVERY_TOPIC,
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
import { drpMessagesHandler } from "./handlers.js";
import { log } from "./logger.js";
import * as operations from "./operations.js";
import { DRPObjectStore } from "./store/index.js";

export { loadConfig };

export class DRPNode {
	config: DRPNodeConfig;
	objectStore: DRPObjectStore;
	networkNode: DRPNetworkNode;
	keychain: Keychain;

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
			})
		);
		await this.networkNode.addMessageHandler(({ stream }: IncomingStreamData) => void drpMessagesHandler(this, stream));
		this.networkNode.addGroupMessageHandler(
			DRP_INTERVAL_DISCOVERY_TOPIC,
			(e: CustomEvent<GossipsubMessage>) => void drpMessagesHandler(this, undefined, e.detail.msg.data)
		);
		this._intervals.forEach((interval) => interval.start());
	}

	async stop(): Promise<void> {
		this._intervals.forEach((interval) => interval.stop());
		await this.networkNode.stop();
	}

	async restart(config?: DRPNodeConfig): Promise<void> {
		await this.stop();

		// reassign the network node ? I think we might not need to do this
		this.networkNode = new DRPNetworkNode(config ? config.network_config : this.config?.network_config);

		await this.start();
		log.info("::restart: Node restarted");
	}

	addCustomGroup(group: string): void {
		this.networkNode.subscribe(group);
	}

	addCustomGroupMessageHandler(group: string, handler: EventCallback<CustomEvent<GossipsubMessage>>): void {
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

	async addCustomMessageHandler(protocol: string | string[], handler: StreamHandler): Promise<void> {
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
		operations.createObject(this, object);
		operations.subscribeObject(this, object.id);
		if (options.sync?.enabled) {
			await operations.syncObject(this, object.id, options.sync.peerId);
		}
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
		const object = await operations.connectObject(this, options.id, {
			peerId: options.sync?.peerId,
			drp: options.drp,
			metrics: options.metrics,
		});
		this._createIntervalDiscovery(options.id);
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

	async handleDiscoveryResponse(sender: string, data: Uint8Array): Promise<void> {
		const response = DRPDiscoveryResponse.decode(data);
		const objectId = response.objectId;
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
