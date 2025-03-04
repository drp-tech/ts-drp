import { IntervalRunner } from "@ts-drp/interval-runner";
import { Logger } from "@ts-drp/logger";
import {
	IntervalRunner as IntervalRunnerInterface,
	DRPIntervalDiscoveryOptions,
	DRPNetworkNode,
	MessageType,
	DRPDiscovery as DRPDiscoveryRequest,
	DRPDiscoveryResponse,
	Message,
	DRP_DISCOVERY_TOPIC,
	SubscriberInfo,
} from "@ts-drp/types";

/**
 * Enhanced DRP Discovery service using composition pattern
 * Implements IntervalRunnerInterface to maintain compatibility with IntervalRunner[] arrays
 */
export class DRPIntervalDiscovery implements IntervalRunnerInterface<"interval:discovery"> {
	readonly type = "interval:discovery";

	/** Network node instance used for peer communication */
	readonly networkNode: DRPNetworkNode;

	/** Duration in milliseconds to search for peers before giving up */
	readonly searchDuration: number;

	/** Start time of the search for peers */
	private _searchStartTime?: number;

	/** Delegate to handle the actual interval running */
	private _intervalRunner: IntervalRunner;

	/** Logger instance with discovery-specific prefix */
	private _logger: Logger;

	/**
	 * Creates a new DRP Discovery instance
	 */
	constructor(opts: DRPIntervalDiscoveryOptions) {
		const defaultSearchDuration = 5 * 60 * 1000; // 5 minutes
		this.networkNode = opts.networkNode;
		this.searchDuration = opts.searchDuration ?? defaultSearchDuration;
		this._logger = new Logger(`drp::discovery::${opts.id}`, opts.logConfig);
		// Create the delegate interval runner
		this._intervalRunner = new IntervalRunner({
			...opts,
			fn: async () => {
				await this._runHeartbeat();
				return true; // Always continue the interval
			},
		});
	}

	get id(): string {
		return this._intervalRunner.id;
	}

	/**
	 * Runs a single heartbeat cycle to discover peers
	 */
	private async _runHeartbeat(): Promise<void> {
		console.log("runHeartbeat", this._searchStartTime);
		// Early exit if we already have peers
		if (this._hasPeers()) {
			console.log("hasPeers");
			this._searchStartTime = undefined;
			return;
		}

		if (!this._searchStartTime) {
			console.log("no searchStartTime");
			this._searchStartTime = Date.now();
		}

		if (this._isSearchTimedOut()) {
			console.log("isSearchTimedOut");
			this._logger.error(`No peers found after ${this.searchDuration}ms of searching`);
			this._searchStartTime = undefined;
			return;
		}

		await this._broadcastDiscoveryRequest();
	}

	/**
	 * Checks if we have any peers for this object ID
	 */
	private _hasPeers(): boolean {
		return this.networkNode.getGroupPeers(this.id).length > 0;
	}

	/**
	 * Checks if the search has exceeded the maximum duration
	 */
	private _isSearchTimedOut(): boolean {
		console.log("isSearchTimedOutin", this._searchStartTime);
		if (!this._searchStartTime) return false;
		const now = Date.now();
		const elapsed = now - this._searchStartTime;
		this._logger.info(`Search time elapsed: ${elapsed}ms`);
		return elapsed >= this.searchDuration;
	}

	/**
	 * Broadcasts a discovery request to find peers
	 */
	private async _broadcastDiscoveryRequest(): Promise<void> {
		try {
			const data = DRPDiscoveryRequest.create({ objectId: this.id });
			const message = Message.create({
				sender: this.networkNode.peerId.toString(),
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
				data: DRPDiscoveryRequest.encode(data).finish(),
			});

			this._logger.info("Broadcasting discovery request");
			await this.networkNode.broadcastMessage(DRP_DISCOVERY_TOPIC, message);
		} catch (error) {
			this._logger.error("Error broadcasting discovery request:", error);
		}
	}

	/**
	 * Starts the discovery process
	 */
	start(): void {
		console.log("start");
		this._intervalRunner.start();
	}

	/**
	 * Stops the discovery process
	 */
	stop(): void {
		this._intervalRunner.stop();
	}

	/**
	 * Returns the current state of the discovery process
	 */
	get state(): "running" | "stopped" {
		return this._intervalRunner.state;
	}

	/**
	 * Handles incoming discovery response messages
	 *
	 * @param sender - The sender of the discovery response
	 * @param data - The data of the discovery response
	 */
	async handleDiscoveryResponse(
		sender: string,
		subscribers: Record<string, SubscriberInfo>
	): Promise<void> {
		this._logger.info("Received discovery response from", sender);

		try {
			await this._connectToDiscoveredPeers(subscribers);
		} catch (error) {
			this._logger.error("Error processing discovery response:", error);
		}
	}

	/**
	 * Connects to peers from a discovery response
	 */
	private async _connectToDiscoveredPeers(
		subscribers: Record<string, SubscriberInfo>
	): Promise<void> {
		const selfId = this.networkNode.peerId.toString();

		for (const [peerId, info] of Object.entries(subscribers)) {
			// Skip ourselves
			if (peerId === selfId) continue;

			this._logger.info("Connecting to discovered peer:", peerId);
			try {
				await this.networkNode.connect(info.multiaddrs);
			} catch (error) {
				this._logger.error(`Failed to connect to peer ${peerId}:`, error);
			}
		}
	}

	/**
	 * Static handler for incoming discovery requests
	 *
	 * @param sender - The sender of the discovery request
	 * @param data - The data of the discovery request
	 * @param networkNode - The network node instance
	 */
	static async handleDiscoveryRequest(
		sender: string,
		data: Uint8Array,
		networkNode: DRPNetworkNode
	): Promise<void> {
		const logger = new Logger("drp::discovery::static");

		try {
			const request = DRPDiscoveryRequest.decode(data);
			const objectId = request.objectId;

			// Get all peers for this object ID
			const peers = networkNode.getGroupPeers(objectId);
			if (peers.length === 0) return; // No peers to report

			// Collect peer information
			const subscribers = await DRPIntervalDiscovery._collectPeerInfo(peers, networkNode, logger);
			if (Object.keys(subscribers).length === 0) return;

			// Send response
			await DRPIntervalDiscovery._sendDiscoveryResponse(sender, networkNode, subscribers, objectId);
		} catch (error) {
			logger.error("Error handling discovery request:", error);
		}
	}

	/**
	 * Collects connection information for a list of peers
	 */
	private static async _collectPeerInfo(
		peers: string[],
		networkNode: DRPNetworkNode,
		logger: Logger
	): Promise<Record<string, SubscriberInfo>> {
		const subscribers: Record<string, SubscriberInfo> = {};

		for (const peerId of peers) {
			try {
				const multiaddrs = await networkNode.getPeerMultiaddrs(peerId);
				subscribers[peerId] = {
					multiaddrs: multiaddrs.map((addr) => `${addr.multiaddr.toString()}/p2p/${peerId}`),
				};
			} catch (error) {
				logger.error(`Error getting multiaddrs for peer ${peerId}:`, error);
			}
		}

		return subscribers;
	}

	/**
	 * Sends a discovery response to a specific peer
	 */
	private static async _sendDiscoveryResponse(
		recipient: string,
		networkNode: DRPNetworkNode,
		subscribers: Record<string, SubscriberInfo>,
		objectId: string
	): Promise<void> {
		try {
			const response = DRPDiscoveryResponse.create({ subscribers, objectId });
			const message = Message.create({
				sender: recipient,
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY_RESPONSE,
				data: DRPDiscoveryResponse.encode(response).finish(),
			});

			await networkNode.sendMessage(recipient, message);
		} catch (error) {
			console.error("Error sending discovery response:", error);
		}
	}
}

/**
 * Factory function for creating DRPDiscovery instances
 * Returns an instance that implements IntervalRunnerInterface
 */
export function createDRPDiscovery(opts: DRPIntervalDiscoveryOptions): DRPIntervalDiscovery {
	return new DRPIntervalDiscovery(opts);
}
