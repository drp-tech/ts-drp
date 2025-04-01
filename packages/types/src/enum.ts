export enum IntervalRunnerState {
	Running = "running",
	Stopped = "stopped",
}

export enum NodeEventName {
	DRP_FETCH_STATE = "drp:fetchState",
	DRP_FETCH_STATE_RESPONSE = "drp:fetchState:response",
	DRP_UPDATE = "drp:update",
	DRP_SYNC = "drp:sync",
	DRP_SYNC_MISSING = "drp:sync:missing",
	DRP_SYNC_ACCEPTED = "drp:sync:accepted",
	DRP_SYNC_REJECTED = "drp:sync:rejected",
	DRP_ATTESTATION_UPDATE = "drp:attestation:update",
}
