import { type DRPNetworkNode, type IIntervalRunner } from "./index.js";

/**
 * Configuration interface for IDRPIntervalReconnectBootstrap
 * @interface IDRPIntervalReconnectBootstrap
 */
export interface IDRPIntervalReconnectBootstrap
	extends IIntervalRunne<"interval:reconnect-bootstrap"> {
	/** Network node instance used for peer communication */
	readonly networkNode: DRPNetworkNode;
	/** Duration in milliseconds to search for peers before giving up. Defaults to 5 minutes */
	readonly searchDuration?: number;
}
