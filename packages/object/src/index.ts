import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { Logger } from "@ts-drp/logger";
import {
	type ApplyResult,
	type CreateObjectOptions,
	type DRPObjectCallback2,
	type DRPObjectOptions,
	type DRPState,
	type IACL,
	type IDRP,
	type IDRPObject2,
	type IFinalityStore,
	type MergeResult,
	type Vertex,
} from "@ts-drp/types";

import { ObjectACL } from "./acl/index.js";
import { FinalityStore } from "./finality/index.js";
import { HashGraph } from "./hashgraph/index.js";
import { DRPVertexApplier } from "./object2.js";
import { DRPObjectStateManager } from "./state.js";

export * from "./acl/index.js";
export * from "./hashgraph/index.js";
export * from "./object2.js";

function defaultIDFromPeerID(peerId: string): string {
	return bytesToHex(
		sha256
			.create()
			.update(peerId)
			.update(Math.floor(Math.random() * Number.MAX_VALUE).toString())
			.digest()
	);
}

function defaultACL(peerId: string): IACL {
	return new ObjectACL({
		admins: [peerId],
		permissionless: true,
	});
}

export function createObject<T extends IDRP>(options: CreateObjectOptions<T>): IDRPObject2<T> {
	const acl = new ObjectACL({
		admins: [],
		permissionless: true,
	});

	const object = new DRPObject<T>({ ...options, config: { log_config: options.log_config }, acl });
	return object;
}

export class DRPObject<T extends IDRP> implements IDRPObject2<T> {
	readonly id: string;
	private readonly log: Logger;
	private readonly hg: HashGraph;

	private _applier: DRPVertexApplier<T>;
	private _states: DRPObjectStateManager<T>;

	private subscriptions: DRPObjectCallback2<T>[] = [];
	private _finalityStore: FinalityStore;

	constructor({
		peerId,
		id = defaultIDFromPeerID(peerId),
		acl = defaultACL(peerId),
		drp,
		config,
		//metrics,
	}: DRPObjectOptions<T>) {
		this.id = id;
		this.log = new Logger(`drp::object2::${this.id}`, config?.log_config);

		this.hg = new HashGraph(
			peerId,
			acl.resolveConflicts?.bind(acl),
			drp?.resolveConflicts?.bind(drp),
			drp?.semanticsType
		);

		this._finalityStore = new FinalityStore(config?.finality_config, config?.log_config);
		this._states = new DRPObjectStateManager(acl, drp);
		this._applier = new DRPVertexApplier({
			drp,
			acl,
			hg: this.hg,
			states: this._states,
			finalityStore: this._finalityStore,
			notify: this._notify.bind(this),
		});
	}

	get drp(): T | undefined {
		return this._applier.drp;
	}

	get acl(): IACL {
		return this._applier.acl;
	}

	get vertices(): Vertex[] {
		return this.hg.getAllVertices();
	}

	get finalityStore(): IFinalityStore {
		return this._finalityStore;
	}

	getStates(vertexHash: string): [DRPState | undefined, DRPState | undefined] {
		return [this._states.getACL(vertexHash), this._states.getDRP(vertexHash)];
	}

	setACLState(vertexHash: string, aclState: DRPState): void {
		this._states.setACL(vertexHash, aclState);
	}

	setDRPState(vertexHash: string, drpState: DRPState): void {
		this._states.setDRP(vertexHash, drpState);
	}

	async applyVertices(vertices: Vertex[]): Promise<ApplyResult> {
		return this._applier.applyVertices(vertices);
	}

	async merge(vertices: Vertex[]): Promise<MergeResult> {
		const { applied, missing } = await this._applier.applyVertices(vertices);
		return [applied, missing];
	}

	subscribe(callback: DRPObjectCallback2<T>): void {
		this.subscriptions.push(callback);
	}

	private _notify(origin: string, vertices: Vertex[]): void {
		for (const callback of this.subscriptions) {
			callback(this, origin, vertices);
		}
	}
}
