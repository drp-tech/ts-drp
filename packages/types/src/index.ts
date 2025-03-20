import { type IDRPIntervalDiscovery } from "./drp-interval-discovery.js";
import { type IDRPIntervalReconnectBootstrap } from "./drp-interval-reconnect.js";
import { type IIntervalRunner } from "./interval-runner.js";

export {
	Vertex,
	Vertex_Operation as Operation,
	Attestation,
	AggregatedAttestation,
	DRPStateEntry,
	DRPState,
	DRPStateEntryOtherTheWire,
	DRPStateOtherTheWire,
	DRPObjectBase,
} from "./proto/drp/v1/object_pb.js";
export {
	Message,
	MessageType,
	FetchState,
	FetchStateResponse,
	Update,
	AttestationUpdate,
	Sync,
	SyncAccept,
	SyncReject,
	DRPDiscovery,
	DRPDiscoveryResponse,
} from "./proto/drp/v1/messages_pb.js";

export * from "./acl.js";
export type * from "./bitset.js";
export * from "./drp.js";
export type * from "./finality.js";
export * from "./hashgraph.js";
export type * from "./interval-runner.js";
export * from "./constants.js";
export * from "./enum.js";
export type * from "./keychain.js";
export type * from "./logger.js";
export type * from "./metrics.js";
export type * from "./network.js";
export type * from "./node.js";
export type * from "./object.js";
export type * from "./drp-interval-discovery.js";
export type * from "./drp-interval-reconnect.js";

/**
 * A map of all interval runners
 */
export interface IntervalRunnerMap {
	/**
	 * The interval runner for the interval runner
	 */
	"interval:runner": IIntervalRunner<"interval:runner">;

	/**
	 * The interval runner for the interval reconnect
	 */
	"interval:reconnect": IDRPIntervalReconnectBootstrap;

	/**
	 * The interval runner for the interval discovery
	 */
	"interval:discovery": IDRPIntervalDiscovery;
}
