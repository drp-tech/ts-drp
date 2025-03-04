import { IntervalRunnerOptions } from "./interval-runner.js";
import { DRPNetworkNode } from "./network.js";

export interface DRPIntervalDiscoveryOptions extends Omit<IntervalRunnerOptions, "fn"> {
	/** Unique identifier for the object */
	readonly id: string;
	/** Network node instance used for peer communication */
	readonly networkNode: DRPNetworkNode;
	/** Duration in milliseconds to search for peers before giving up. Defaults to 5 minutes */
	readonly searchDuration?: number;
}

/**
 * Configuration interface for DRPIntervalDiscovery
 * @interface DRPIntervalDiscovery
 */
export interface DRPIntervalDiscovery {
	/** Unique identifier for the object */
	readonly id: string;
	/** Network node instance used for peer communication */
	readonly networkNode: DRPNetworkNode;
	/** Duration in milliseconds to search for peers before giving up. Defaults to 5 minutes */
	readonly searchDuration?: number;
}
