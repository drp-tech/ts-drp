import { type IIntervalRunner, type IntervalRunnerOptions } from "./interval-runner.js";
import { type DRPNetworkNode } from "./network.js";

export interface DRPIntervalReconnectOptions extends Omit<IntervalRunnerOptions, "fn"> {
	/** Network node instance used for peer communication */
	readonly networkNode: DRPNetworkNode;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IDRPIntervalReconnectBootstrap extends IIntervalRunner<"interval:reconnect"> {}
