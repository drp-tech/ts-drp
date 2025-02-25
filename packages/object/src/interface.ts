import { IMetrics } from "@ts-drp/tracer";
import { Operation, Vertex } from "@ts-drp/types";

import type { ResolveConflictsType, SemanticsType } from "./hashgraph/index.js";
import type { DRPObject } from "./index.js";

export enum DrpType {
	ACL = "ACL",
	DRP = "DRP",
}

export type DRPObjectCallback<T extends DRP> = (
	object: DRPObject<T>,
	origin: string,
	vertices: Vertex[]
) => void;

export interface DRPPublicCredential {
	ed25519PublicKey: string;
	blsPublicKey: string;
}

export interface DRP {
	semanticsType: SemanticsType;
	resolveConflicts(vertices: Vertex[]): ResolveConflictsType;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}

export interface LcaAndOperations {
	lca: string;
	linearizedOperations: Operation[];
}
export type ConnectObjectOptions<T extends DRP> = {
	peerId: string;
	id?: string;
	drp?: T;
	metrics?: IMetrics;
};
