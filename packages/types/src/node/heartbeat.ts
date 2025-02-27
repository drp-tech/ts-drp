export interface IDRPIDHeartbeat {
	/**
	 * Starts the heartbeat process.
	 * Initiates periodic heartbeat checks at the configured interval.
	 */
	start(): void;

	/**
	 * Stops the heartbeat process.
	 * Clears the interval timer and stops periodic heartbeat checks.
	 */
	stop(): void;

	/**
	 * Performs a single heartbeat check.
	 * Checks if the object is connected to any peers.
	 * If not, it will broadcast a heartbeat to the network for up to 5 minutes.
	 */
	heartbeat(): Promise<void>;

	/**
	 * Handles an incoming heartbeat response from a peer.
	 * Connects to discovered peers that have the same object.
	 * @param sender - The sender's peer ID
	 * @param data - Encoded heartbeat response data
	 */
	onReceiveHeartbeatResponse(sender: string, data: Uint8Array): Promise<void>;
}

export const DRP_HEARTBEAT_TOPIC = "drp::heartbeat";
