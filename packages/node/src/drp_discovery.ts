import { IntervalRunner } from "@ts-drp/interval-runner/dist/src/index.js";
import { DRPNetworkNode } from "@ts-drp/network";
import { IntervalRunner as IntervalRunnerInterface, LoggerOptions } from "@ts-drp/types";

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

class DRPDiscovery extends IntervalRunner {
	constructor(private readonly node: DRPNode) {}
}

export function createDRPDiscovery(node: DRPNode): IntervalRunnerInterface {
	return new DRPDiscovery(node);
}
