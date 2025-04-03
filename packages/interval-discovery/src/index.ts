import { IntervalRunner } from "@ts-drp/interval-runner";
import { Logger } from "@ts-drp/logger";
import {
	DRP_INTERVAL_DISCOVERY_TOPIC,
	DRPDiscovery as DRPDiscoveryRequest,
	DRPDiscoveryResponse,
	type DRPIntervalDiscoveryOptions,
	type DRPNetworkNode,
	type IDRPIntervalDiscovery,
	type IntervalRunnerState,
	Message,
	MessageType,
	type SubscriberInfo,
} from "@ts-drp/types";

const DEFAULT_SEARCH_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Enhanced DRP Discovery service using composition pattern
 * Implements IntervalRunnerInterface to maintain compatibility with IntervalRunner[] arrays
 */
export class DRPIntervalDiscovery implements IDRPIntervalDiscovery {
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
	 * @param opts - The configuration for the discovery
	 */
	constructor(opts: DRPIntervalDiscoveryOptions) {
		this.networkNode = opts.networkNode;
		this.searchDuration = opts.searchDuration ?? DEFAULT_SEARCH_DURATION;
		this._logger = new Logger(`drp::discovery::${opts.id}`, opts.logConfig);
		// Create the delegate interval runner
		this._intervalRunner = new IntervalRunner({
			...opts,
			fn: this._runDRPDiscovery.bind(this),
		});
	}

	/**
	 * Get the id of the interval runner
	 * @returns The id of the interval runner
	 */
	get id(): string {
		return this._intervalRunner.id;
	}

	/**
	 * Runs a single discovery cycle to find and connect with peers
	 * @returns True if the discovery should continue, false if it should stop
	 */
	private async _runDRPDiscovery(): Promise<boolean> {
		// Early exit if we already have peers
		if (this._hasPeers()) {
			this._searchStartTime = undefined;
			return true;
		}

		if (!this._searchStartTime) {
			this._searchStartTime = Date.now();
		}

		if (this._isSearchTimedOut(this._searchStartTime)) {
			this._logger.error(`No peers found after ${this.searchDuration}ms of searching`);
			this._searchStartTime = undefined;
			return true;
		}

		await this._broadcastDiscoveryRequest();
		return true;
	}

	/**
	 * Checks if we have any peers for this object ID
	 * @returns True if we have peers, false otherwise
	 */
	private _hasPeers(): boolean {
		return this.networkNode.getGroupPeers(this.id).length > 0;
	}

	/**
	 * Checks if the search has exceeded the maximum duration
	 * @param searchStartTime - The start time of the search
	 * @returns True if the search has exceeded the maximum duration, false otherwise
	 */
	private _isSearchTimedOut(searchStartTime: number): boolean {
		const elapsed = Date.now() - searchStartTime;
		return elapsed >= this.searchDuration;
	}

	/**
	 * Broadcasts a discovery request to find peers
	 */
	private async _broadcastDiscoveryRequest(): Promise<void> {
		try {
			const data = DRPDiscoveryRequest.create({});
			const message = Message.create({
				sender: this.networkNode.peerId.toString(),
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
				data: DRPDiscoveryRequest.encode(data).finish(),
				objectId: this.id,
			});

			this._logger.info("Broadcasting discovery request");
			await this.networkNode.broadcastMessage(DRP_INTERVAL_DISCOVERY_TOPIC, message);
		} catch (error) {
			this._logger.error("Error broadcasting discovery request:", error);
		}
	}

	/**
	 * Starts the discovery process
	 */
	start(): void {
		this._intervalRunner.start();
	}

	/**
	 * Stops the discovery process
	 */
	stop(): void {
		this._intervalRunner.stop();
	}

	/**
	 * Get the state of the discovery process
	 * @returns The state of the discovery process
	 */
	get state(): IntervalRunnerState {
		return this._intervalRunner.state;
	}

	/**
	 * Handles incoming discovery response messages
	 * @param sender - The sender of the discovery response
	 * @param subscribers - The subscribers of the discovery response
	 */
	async handleDiscoveryResponse(sender: string, subscribers: Record<string, SubscriberInfo>): Promise<void> {
		this._logger.info("Received discovery response from", sender);

		await this._connectToDiscoveredPeers(subscribers);
	}

	/**
	 * Connects to peers from a discovery response
	 * @param subscribers - The subscribers of the discovery response
	 */
	private async _connectToDiscoveredPeers(subscribers: Record<string, SubscriberInfo>): Promise<void> {
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
	 * @param sender - The sender of the discovery request
	 * @param message - The message of the discovery request
	 * @param networkNode - The network node instance
	 */
	static async handleDiscoveryRequest(sender: string, message: Message, networkNode: DRPNetworkNode): Promise<void> {
		const logger = new Logger("drp::discovery::static");

		try {
			const objectId = message.objectId;
			// Get all peers for this object ID
			const peers = networkNode.getGroupPeers(objectId);
			if (networkNode.getSubscribedTopics().includes(objectId)) {
				peers.push(networkNode.peerId.toString());
			}
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
	 * @param peers - The peers to collect information for
	 * @param networkNode - The network node instance
	 * @param logger - The logger instance
	 * @returns A record of peers and their subscriber information
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
	 * @param recipient - The recipient of the discovery response
	 * @param networkNode - The network node instance
	 * @param subscribers - The subscribers of the discovery response
	 * @param objectId - The object ID of the discovery response
	 */
	private static async _sendDiscoveryResponse(
		recipient: string,
		networkNode: DRPNetworkNode,
		subscribers: Record<string, SubscriberInfo>,
		objectId: string
	): Promise<void> {
		try {
			const response = DRPDiscoveryResponse.create({ subscribers });
			const message = Message.create({
				sender: recipient,
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY_RESPONSE,
				data: DRPDiscoveryResponse.encode(response).finish(),
				objectId,
			});

			await networkNode.sendMessage(recipient, message);
		} catch (_) {
			// TODO: need to add a global logger for this
		}
	}
}

/**
 * Factory function for creating DRPDiscovery instances
 * Returns an instance that implements IntervalRunnerInterface
 * @param opts - The configuration for the discovery
 * @returns A new DRPDiscovery instance
 */
export function createDRPDiscovery(opts: DRPIntervalDiscoveryOptions): DRPIntervalDiscovery {
	return new DRPIntervalDiscovery(opts);
}
