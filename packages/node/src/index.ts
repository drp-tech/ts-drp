import type { GossipsubMessage } from "@chainsafe/libp2p-gossipsub";
import type { EventCallback, IncomingStreamData, StreamHandler } from "@libp2p/interface";
import { Logger, type LoggerOptions } from "@ts-drp/logger";
import { DRPNetworkNode, type DRPNetworkNodeConfig } from "@ts-drp/network";
import { type ACL, type DRP, DRPObject } from "@ts-drp/object";
import { IMetrics } from "@ts-drp/tracer";
import { IDRPIDHeartbeat, Message, MessageType, DRP_HEARTBEAT_TOPIC } from "@ts-drp/types";

import { drpMessagesHandler, heartbeatHandler } from "./handlers.js";
import { DRPIDHeartbeat, DRPIDHeartbeatConfig } from "./heartbeat.js";
import * as operations from "./operations.js";
import { type DRPCredentialConfig, DRPCredentialStore, DRPObjectStore } from "./store/index.js";

// snake_casing to match the JSON config
export interface DRPNodeConfig {
	log_config?: LoggerOptions;
	network_config?: DRPNetworkNodeConfig;
	credential_config?: DRPCredentialConfig;
	heartbeat_config?: Pick<DRPIDHeartbeatConfig, "interval" | "log_config" | "search_duration">;
}

export let log: Logger;

export class DRPNode {
	config?: DRPNodeConfig;
	objectStore: DRPObjectStore;
	networkNode: DRPNetworkNode;
	credentialStore: DRPCredentialStore;
	heartbeat?: IDRPIDHeartbeat;

	constructor(config?: DRPNodeConfig) {
		this.config = config;
		log = new Logger("drp::node", config?.log_config);
		this.networkNode = new DRPNetworkNode(config?.network_config);
		this.objectStore = new DRPObjectStore();
		this.credentialStore = new DRPCredentialStore(config?.credential_config);
	}

	async start(): Promise<void> {
		await this.credentialStore.start();
		await this.networkNode.start();
		await this.networkNode.addMessageHandler(async ({ stream }: IncomingStreamData) =>
			drpMessagesHandler(this, stream)
		);
		this.networkNode.addGroupMessageHandler(DRP_HEARTBEAT_TOPIC, async (e) =>
			heartbeatHandler(this, undefined, e.detail.msg.data)
		);
		this.heartbeat?.start();
	}

	async stop(): Promise<void> {
		await this.networkNode.stop();
		this.heartbeat?.stop();
	}

	async restart(config?: DRPNodeConfig): Promise<void> {
		await this.stop();
		this.networkNode = new DRPNetworkNode(
			config ? config.network_config : this.config?.network_config
		);
		await this.start();
	}

	addCustomGroup(group: string) {
		this.networkNode.subscribe(group);
	}

	addCustomGroupMessageHandler(
		group: string,
		handler: EventCallback<CustomEvent<GossipsubMessage>>
	) {
		this.networkNode.addGroupMessageHandler(group, handler);
	}

	async sendGroupMessage(group: string, data: Uint8Array) {
		const message = Message.create({
			sender: this.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_CUSTOM,
			data,
		});
		await this.networkNode.broadcastMessage(group, message);
	}

	async addCustomMessageHandler(protocol: string | string[], handler: StreamHandler) {
		await this.networkNode.addCustomMessageHandler(protocol, handler);
	}

	async sendCustomMessage(peerId: string, data: Uint8Array) {
		const message = Message.create({
			sender: this.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_CUSTOM,
			data,
		});
		await this.networkNode.sendMessage(peerId, message);
	}

	async createObject(options: {
		drp?: DRP;
		acl?: ACL;
		id?: string;
		sync?: {
			enabled: boolean;
			peerId?: string;
		};
		metrics?: IMetrics;
	}) {
		const object = new DRPObject({
			peerId: this.networkNode.peerId,
			publicCredential: options.acl ? undefined : this.credentialStore.getPublicCredential(),
			acl: options.acl,
			drp: options.drp,
			id: options.id,
			metrics: options.metrics,
		});
		operations.createObject(this, object);
		await operations.subscribeObject(this, object.id);
		if (options.sync?.enabled) {
			await operations.syncObject(this, object.id, options.sync.peerId);
		}
		this.createHeartbeat(object.id);
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
		drp?: DRP;
		sync?: {
			peerId?: string;
		};
		metrics?: IMetrics;
	}) {
		const object = operations.connectObject(this, options.id, {
			peerId: options.sync?.peerId,
			drp: options.drp,
			metrics: options.metrics,
		});
		this.createHeartbeat(options.id);
		return object;
	}

	async subscribeObject(id: string) {
		await operations.subscribeObject(this, id);
	}

	private createHeartbeat(id: string): void {
		if (this.heartbeat) this.heartbeat.stop();
		this.heartbeat = new DRPIDHeartbeat({
			...this.config?.heartbeat_config,
			id,
			network_node: this.networkNode,
		});
		this.heartbeat.start();
	}

	unsubscribeObject(id: string, purge?: boolean) {
		operations.unsubscribeObject(this, id, purge);
		this.networkNode.removeTopicScoreParams(id);
	}

	async syncObject(id: string, peerId?: string) {
		await operations.syncObject(this, id, peerId);
	}
}
