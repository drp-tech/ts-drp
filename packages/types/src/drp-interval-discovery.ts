import { type IIntervalRunner, type IntervalRunnerOptions } from "./interval-runner.js";
import { type DRPNetworkNode } from "./network.js";

/**
 * Type representing a subscriber with their multiaddresses
 */
export interface SubscriberInfo {
	multiaddrs: string[];
}

export interface DRPIntervalDiscoveryOptions extends Omit<IntervalRunnerOptions, "fn"> {
	/** Unique identifier for the object */
	readonly id: string;
	/** Network node instance used for peer communication */
	readonly networkNode: DRPNetworkNode;
	/** Duration in milliseconds to search for peers before giving up. Defaults to 5 minutes */
	readonly searchDuration?: number;
}

/**
 * Enhanced DRP Discovery service using composition pattern
 * Implements IntervalRunnerInterface to maintain compatibility with IntervalRunner[] arrays
 * @interface IDRPIntervalDiscovery
 */
export interface IDRPIntervalDiscovery extends IIntervalRunner<"interval:discovery"> {
	/** Unique identifier for the object */
	readonly id: string;
	/** Network node instance used for peer communication */
	readonly networkNode: DRPNetworkNode;
	/** Duration in milliseconds to search for peers before giving up. Defaults to 5 minutes */
	readonly searchDuration?: number;

	/**
	 * Handles a discovery response from a peer
	 * @param sender - The sender of the discovery response
	 * @param data - The data of the discovery response
	 */
	handleDiscoveryResponse(sender: string, subscribers: Record<string, SubscriberInfo>): Promise<void>;
}
