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
	IDHeartbeat,
	IDHeartbeatResponse,
} from "./proto/drp/v1/messages_pb.js";
export { IDRPIDHeartbeat, DRP_HEARTBEAT_TOPIC } from "./node/heartbeat.js";
