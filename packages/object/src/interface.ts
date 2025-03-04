import { LoggerOptions } from "@ts-drp/logger";
import { IMetrics } from "@ts-drp/tracer";
import { Operation, SemanticsType, Vertex } from "@ts-drp/types";

import type { ResolveConflictsType } from "./hashgraph/index.js";
import type { DRPObject } from "./index.js";

export enum DrpType {
	ACL = "ACL",
	DRP = "DRP",
}

export type DRPObjectCallback = (object: DRPObject, origin: string, vertices: Vertex[]) => void;

export interface DRPPublicCredential {
	secp256k1PublicKey: string;
	blsPublicKey: string;
}

export interface DRP {
	semanticsType: SemanticsType;
	resolveConflicts?: (vertices: Vertex[]) => ResolveConflictsType;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}

export interface LcaAndOperations {
	lca: string;
	linearizedOperations: Operation[];
}
export type ConnectObjectOptions = {
	peerId: string;
	id?: string;
	drp?: DRP;
	metrics?: IMetrics;
	log_config?: LoggerOptions;
};
