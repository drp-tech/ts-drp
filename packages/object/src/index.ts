import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { Logger } from "@ts-drp/logger";
import {
	type ApplyResult,
	type CreateObjectOptions,
	type DRPCreationArgs,
	type DRPObjectCallback,
	type DRPObjectOptions,
	type DRPState,
	type IACL,
	type IDRP,
	type IDRPObject,
	type IFinalityStore,
	type MergeResult,
	type Vertex,
} from "@ts-drp/types";

import { createPermissionlessACL } from "./acl/index.js";
import { createDRPVertexApplier, type DRPVertexApplier } from "./drp-applier.js";
import { FinalityStore } from "./finality/index.js";
import { createVertex, HashGraph } from "./hashgraph/index.js";
import { type DRPObjectStateManager } from "./state.js";

export * from "./acl/index.js";
export * from "./hashgraph/index.js";

function getDRPObjectID(peerId: string, salt?: number): string {
	return bytesToHex(
		sha256
			.create()
			.update(peerId)
			.update(salt?.toString() ?? Math.floor(Math.random() * Number.MAX_VALUE).toString())
			.digest()
	);
}

/**
 * Creates a DRPObject.
 * @param options - The options for the DRPObject.
 * @returns The DRPObject.
 */
export function createObject<T extends IDRP>(options: CreateObjectOptions<T>): IDRPObject<T> {
	const acl = createPermissionlessACL();

	const object = new DRPObject<T>({ ...options, config: { log_config: options.log_config }, acl });
	return object;
}

/**
 * Creates the root vertex for the hash graph
 * @param peerId - The peer ID of the node.
 * @param drpCreationArgs - The DRP creation arguments.
 * @returns The root vertex.
 */
export function createHashGraphRootVertex(peerId: string, drpCreationArgs: DRPCreationArgs): Vertex {
	return createVertex(
		peerId,
		{
			drpType: "DRP & ACL",
			opType: "constructor",
			value: { drpArgs: drpCreationArgs.drpArgs, aclArgs: drpCreationArgs.aclArgs },
		},
		[],
		drpCreationArgs.timestamp,
		new Uint8Array()
	);
}

/**
 * A DRPObject.
 * @template T - The type of the DRPObject.
 */
export class DRPObject<T extends IDRP> implements IDRPObject<T> {
	readonly id: string;
	private readonly log: Logger;
	private readonly hashGraph: HashGraph;

	private _applier: DRPVertexApplier<T>;
	private _states: DRPObjectStateManager<T>;

	private subscriptions: DRPObjectCallback<T>[] = [];
	private _finalityStore: FinalityStore;

	/**
	 * Creates a DRPObject.
	 * @param options - The options for the DRPObject.
	 * @param options.peerId - The peer ID of the DRPObject.
	 * @param options.id - The ID of the DRPObject.
	 * @param options.acl - The ACL of the DRPObject.
	 * @param options.drp - The DRP of the DRPObject.
	 * @param options.config - The config of the DRPObject.
	 * @param options.drpCreationArgs - The DRP creation arguments.
	 * @param options.salt - The salt to use for the DRP Object id.
	 */
	constructor({
		peerId,
		id,
		acl = createPermissionlessACL(peerId),
		drp,
		config,
		drpCreationArgs,
		salt,
		//metrics,
	}: DRPObjectOptions<T>) {
		this.id = id ?? getDRPObjectID(peerId, salt);
		this.log = new Logger(`drp::object::${this.id}`, config?.log_config);

		this.hashGraph = new HashGraph(
			peerId,
			acl.resolveConflicts?.bind(acl),
			drp?.resolveConflicts?.bind(drp),
			drpCreationArgs ? createHashGraphRootVertex(peerId, drpCreationArgs) : undefined,
			drp?.semanticsType
		);

		this._finalityStore = new FinalityStore(config?.finality_config, config?.log_config);
		[this._applier, this._states] = createDRPVertexApplier({
			drp,
			acl,
			hashGraph: this.hashGraph,
			finalityStore: this._finalityStore,
			notify: this._notify.bind(this),
			finalityConfig: config?.finality_config,
			logConfig: config?.log_config,
		});
	}

	/**
	 * Initializes the hash graph.
	 * @param rootVertex - The root vertex.
	 */
	initializeHashGraph(rootVertex: Vertex): void {
		this.hashGraph.initializeRootVertex(rootVertex);
	}

	/**
	 * Gets the DRP of the DRPObject.
	 * @returns The DRP of the DRPObject.
	 */
	get drp(): T | undefined {
		return this._applier.drp;
	}

	/**
	 * Gets the ACL of the DRPObject.
	 * @returns The ACL of the DRPObject.
	 */
	get acl(): IACL {
		return this._applier.acl;
	}

	/**
	 * Gets all the vertices of the DRPObject.
	 * @returns The vertices of the DRPObject.
	 */
	get vertices(): Vertex[] {
		return this.hashGraph.getAllVertices();
	}

	/**
	 * Gets the finality store of the DRPObject.
	 * @returns The finality store of the DRPObject.
	 */
	get finalityStore(): IFinalityStore {
		return this._finalityStore;
	}

	/**
	 * Gets the ACL and DRP states of a vertex.
	 * @param vertexHash - The hash of the vertex.
	 * @returns The ACL and DRP states of the vertex.
	 */
	getStates(vertexHash: string): [DRPState | undefined, DRPState | undefined] {
		return [this._states.getACLState(vertexHash), this._states.getDRPState(vertexHash)];
	}

	/**
	 * Sets the ACL state of a vertex.
	 * @param vertexHash - The hash of the vertex.
	 * @param aclState - The ACL state of the vertex.
	 */
	setACLState(vertexHash: string, aclState: DRPState): void {
		this._states.setACLState(vertexHash, aclState);
	}

	/**
	 * Sets the DRP state of a vertex.
	 * @param vertexHash - The hash of the vertex.
	 * @param drpState - The DRP state of the vertex.
	 */
	setDRPState(vertexHash: string, drpState: DRPState): void {
		this._states.setDRPState(vertexHash, drpState);
	}

	/**
	 * Applies a list of vertices to the DRPObject.
	 * @param vertices - The vertices to apply.
	 * @returns The result of the application.
	 */
	async applyVertices(vertices: Vertex[]): Promise<ApplyResult> {
		return this._applier.applyVertices(vertices);
	}

	/**
	 * @deprecated Use applyVertices instead
	 * Merges a list of vertices to the DRPObject.
	 * @param vertices - The vertices to merge.
	 * @returns The result of the merge.
	 */
	async merge(vertices: Vertex[]): Promise<MergeResult> {
		const { applied, missing } = await this._applier.applyVertices(vertices);
		return [applied, missing];
	}

	/**
	 * Subscribes to the DRPObject.
	 * @param callback - The callback to subscribe to the DRPObject.
	 */
	subscribe(callback: DRPObjectCallback<T>): void {
		this.subscriptions.push(callback);
	}

	private _notify(origin: string, vertices: Vertex[]): void {
		for (const callback of this.subscriptions) {
			callback(this, origin, vertices);
		}
	}
}
