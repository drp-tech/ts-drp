import { Logger, type LoggerOptions } from "@ts-drp/logger";
import { DRPNetworkNode } from "@ts-drp/network";
import {
	Message,
	MessageType,
	IDHeartbeat,
	IDHeartbeatResponse,
	IDRPIDHeartbeat,
	DRP_HEARTBEAT_TOPIC,
} from "@ts-drp/types";

/**
 * Configuration interface for DRPObjectHeartbeat
 * @interface DRPIDHeartbeatConfig
 */
export interface DRPIDHeartbeatConfig {
	/** Unique identifier for the object */
	readonly id: string;
	/** Network node instance used for peer communication */
	readonly network_node: DRPNetworkNode;
	/** Interval in milliseconds between heartbeats. Defaults to 10,000ms */
	readonly interval?: number;
	/** Logger configuration options */
	readonly log_config?: LoggerOptions;
	/** Duration in milliseconds to search for peers before giving up. Defaults to 5 minutes */
	readonly search_duration?: number;
}

/**
 * Type representing a subscriber with their multiaddresses
 */
interface SubscriberInfo {
	multiaddrs: string[];
}

/**
 * Manages heartbeat functionality for distributed objects.
 * Periodically checks and maintains connections with peers that share the same object ID.
 * If no peers are found, it broadcasts heartbeat messages to discover peers for a configurable duration.
 *
 * @implements {IDRPIDHeartbeat}
 */
export class DRPIDHeartbeat implements IDRPIDHeartbeat {
	/** Unique identifier for the DRPObject */
	private readonly _id: string;
	/** Interval in milliseconds between heartbeats. Defaults to 10,000ms */
	private readonly _interval: number;
	/** Network node instance used for peer communication */
	private readonly _networkNode: DRPNetworkNode;
	/** Interval ID for the heartbeat timer */
	private _intervalId?: NodeJS.Timeout;
	/** Start time of the search for peers */
	private _searchStartTime?: number;
	/** Duration in milliseconds to search for peers before giving up */
	private _searchDuration: number;
	/** Logger instance for logging */
	private logger: Logger;

	/**
	 * Creates a new DRPObjectHeartbeat instance
	 * @param {DRPIDHeartbeatConfig} config - Configuration object for the heartbeat
	 */
	constructor(config: DRPIDHeartbeatConfig) {
		this._id = config.id;
		this._interval = config.interval ?? 10_000;
		this._searchDuration = config.search_duration ?? 5 * 60 * 1000;
		this._networkNode = config.network_node;
		this.logger = new Logger(`drp::heartbeat::${this._id}`, config.log_config);
	}

	/**
	 * Starts the heartbeat process.
	 * Initiates periodic heartbeat checks at the configured interval.
	 * Each check will attempt to discover peers if none are currently connected.
	 */
	start(): void {
		this._intervalId = setInterval(async () => await this.heartbeat(), this._interval);
	}

	/**
	 * Stops the heartbeat process.
	 * Clears the interval timer and stops periodic heartbeat checks.
	 */
	stop(): void {
		if (this._intervalId) {
			clearInterval(this._intervalId);
			this._intervalId = undefined;
		}
	}

	/**
	 * Performs a single heartbeat check.
	 * If no peers are connected, broadcasts a heartbeat message to discover peers.
	 * Will continue searching for peers for the configured search duration (default 5 minutes).
	 * After the search duration expires without finding peers, stops searching until the next heartbeat.
	 * @returns {Promise<void>}
	 */
	async heartbeat(): Promise<void> {
		if (!this.needHeartbeat()) return;

		// Initialize search start time if this is first attempt
		if (!this._searchStartTime) {
			this._searchStartTime = Date.now();
		}

		if (!this.inHeartbeatWindow(this._searchStartTime)) {
			this.logger.error(`::heartbeat: No peers found after ${this._searchDuration}ms of searching`);
			this._searchStartTime = undefined;
			return;
		}

		await this.sendHeartbeat();
	}

	/**
	 * Checks if a heartbeat needs to be sent by verifying if there are any connected peers.
	 * If peers are found, resets the search timer.
	 * @returns {boolean} True if heartbeat is needed (no peers found), false otherwise
	 * @private
	 */
	private needHeartbeat(): boolean {
		const peers = this._networkNode.getGroupPeers(this._id);
		if (peers.length !== 0) {
			this._searchStartTime = undefined;
			return false;
		}
		return true;
	}

	/**
	 * Checks if the current search is within the configured time window.
	 * @returns {boolean} True if within search window, false if search time has expired or not started
	 * @private
	 */
	private inHeartbeatWindow(_searchStartTime: number): boolean {
		const searchDuration = Date.now() - _searchStartTime;
		return searchDuration < this._searchDuration;
	}

	/**
	 * Broadcasts a heartbeat message to the network to discover peers.
	 * Creates and sends an IDHeartbeat message containing this node's object ID.
	 * @returns {Promise<void>}
	 * @private
	 */
	private async sendHeartbeat(): Promise<void> {
		const data = IDHeartbeat.create({ objectId: this._id });
		const message = Message.create({
			sender: this._networkNode.peerId.toString(),
			type: MessageType.MESSAGE_TYPE_ID_HEARTBEAT,
			data: IDHeartbeat.encode(data).finish(),
		});

		this.logger.info("::heartbeat: Broadcasting heartbeat");
		await this._networkNode.broadcastMessage(DRP_HEARTBEAT_TOPIC, message);
	}

	/**
	 * Handles incoming heartbeat response messages from other peers.
	 * Attempts to connect to all peers listed in the response that have the same object ID.
	 *
	 * @param {string} sender - PeerId of the peer that sent the response
	 * @param {Uint8Array} data - Encoded heartbeat response message
	 */
	async onReceiveHeartbeatResponse(sender: string, data: Uint8Array) {
		this.logger.info("::onReceiveHeartbeatResponse: Received heartbeat response from", sender);
		const heartbeatResponse = IDHeartbeatResponse.decode(data);
		for (const [peer, subscribers] of Object.entries(heartbeatResponse.subscribers)) {
			// Don't connect to ourselves
			if (peer === this._networkNode.peerId.toString()) continue;

			this.logger.info("::onReceiveHeartbeatResponse: Connecting to", peer);
			await this._networkNode.connect(subscribers.multiaddrs);
		}
	}

	/**
	 * Static handler for incoming heartbeat messages.
	 * When a peer broadcasts a heartbeat searching for others with the same object ID,
	 * this handler responds with information about all known peers for that object.
	 *
	 * @param {string} sender - PeerId of the peer that sent the heartbeat
	 * @param {Uint8Array} data - Encoded heartbeat message
	 * @param {DRPNetworkNode} networkNode - Network node instance to use for sending the response
	 */
	static async onReceiveHeartbeat(
		sender: string,
		data: Uint8Array,
		networkNode: DRPNetworkNode
	): Promise<void> {
		const heartbeat = IDHeartbeat.decode(data);

		const peers = networkNode.getGroupPeers(heartbeat.objectId);
		const subscribers: Record<string, SubscriberInfo> = {};
		for (const peer of peers) {
			subscribers[peer] = {
				multiaddrs: (await networkNode.getPeerMultiaddrs(peer)).map(
					(addr) => `${addr.multiaddr.toString()}/p2p/${peer}`
				),
			};
		}

		if (Object.keys(subscribers).length === 0) return;
		await DRPIDHeartbeat.sendHeartbeatResponse(sender, networkNode, subscribers);
	}

	/**
	 * Sends a heartbeat response message to a specific peer.
	 * @param {string} sender - PeerId of the peer to send the response to
	 * @param {DRPNetworkNode} networkNode - Network node instance to use for sending
	 * @param {Record<string, SubscriberInfo>} subscribers - Map of peer IDs to their multiaddresses
	 * @returns {Promise<void>}
	 * @private
	 */
	private static async sendHeartbeatResponse(
		sender: string,
		networkNode: DRPNetworkNode,
		subscribers: Record<string, SubscriberInfo>
	): Promise<void> {
		const response = IDHeartbeatResponse.create({ subscribers });

		const message = Message.create({
			sender,
			type: MessageType.MESSAGE_TYPE_ID_HEARTBEAT_RESPONSE,
			data: IDHeartbeatResponse.encode(response).finish(),
		});
		await networkNode.sendMessage(sender, message);
	}
}
