import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { Logger } from "@ts-drp/logger";
import {
	type ApplyResult,
	type CreateObjectOptions,
	type DRPObjectCallback2,
	type DRPObjectOptions,
	type DRPState,
	DrpType,
	type Hash,
	type IACL,
	type IDRP,
	type IDRPObject2,
	type IFinalityStore,
	type MergeResult,
	type Vertex,
} from "@ts-drp/types";

import { ObjectACL } from "./acl/index.js";
import { FinalityStore } from "./finality/index.js";
import { HashGraph, OperationType } from "./hashgraph/index.js";
import { DRPObjectStateManager, DRPObjectStateManager2 } from "./state.js";

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

	private _acl: ACLSubObject<IACL>;
	private _drp?: DRPSubObject<T>;
	private _states: DRPObjectStateManager2<T>;

	private subscriptions: DRPObjectCallback2<T>[] = [];
	private aclStates: DRPObjectStateManager<IACL>;
	private drpStates?: DRPObjectStateManager<T>;
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
			acl.resolveConflicts?.callFnPipeline(acl),
			drp?.resolveConflicts?.callFnPipeline(drp),
			drp?.semanticsType
		);

		this._finalityStore = new FinalityStore(config?.finality_config, config?.log_config);

		// I don't like this
		this.aclStates = new DRPObjectStateManager(acl);
		if (drp) {
			this.drpStates = new DRPObjectStateManager(drp);
		}
		this._acl = new ACLSubObject({
			drp: acl,
			hg: this.hg,
			type: DrpType.ACL,
			localPeerID: peerId,
			states: this.aclStates,
			drpStates: this.drpStates,
			finalityStore: this._finalityStore,
			notify: this._notify.callFnPipeline(this),
		});

		if (drp) {
			this._drp = new DRPSubObject({
				drp,
				hg: this.hg,
				type: DrpType.DRP,
				localPeerID: peerId,
				aclStates: this.aclStates,
				states: this.drpStates,
				finalityStore: this._finalityStore,
				notify: this._notify.callFnPipeline(this),
			});
		}

		this._states = new DRPObjectStateManager2(acl, drp);
	}

	get drp(): T | undefined {
		return this._drp?.drp;
	}

	get acl(): IACL {
		return this._acl.drp;
	}

	get vertices(): Vertex[] {
		return this.hg.getAllVertices();
	}

	get finalityStore(): IFinalityStore {
		return this._finalityStore;
	}

	getStates(vertexHash: string): [DRPState | undefined, DRPState | undefined] {
		const aclState = this.aclStates.get(vertexHash);
		const drpState = this.drpStates?.get(vertexHash);
		return [aclState, drpState];
	}

	setACLState(vertexHash: string, aclState: DRPState): void {
		this.aclStates.set(vertexHash, aclState);
	}

	setDRPState(vertexHash: string, drpState: DRPState): void {
		this.drpStates?.set(vertexHash, drpState);
	}

	async applyVertices(vertices: Vertex[]): Promise<ApplyResult> {
		const missing: Hash[] = [];
		const newVertices: Vertex[] = [];

		for (const v of vertices) {
			if (!v.operation) {
				this.log.warn("Vertex has no operation", v);
				continue;
			}
			if (this.hg.vertices.has(v.hash)) {
				this.log.warn("Vertex already exists", v);
				continue;
			}

			if (v.operation.opType === OperationType.NOP) {
				this.log.warn("Vertex is a NOP", v);
				continue;
			}

			try {
				if (v.operation.drpType === DrpType.ACL) {
					await this._acl.apply(v);
					newVertices.push(v);
					continue;
				}

				// extract vertex created by apply
				await this._drp?.apply(v);
				// add vertex here
				// save to states
				newVertices.push(v);
			} catch (e) {
				this.log.error("Error applying vertex", e);
				missing.push(v.hash);
			}
		}

		const frontier = this.hg.getFrontier();
		const lca = this.hg.getLCA(frontier);
		const acl = this.aclStates.drpFromHash(lca.lca);
		const [drpVertices, aclVertices] = splitOperation(lca.linearizedVertices);

		await applyVertices(acl, aclVertices);
		Object.assign(this.acl, acl);
		if (this.drpStates && this.drp) {
			const drp = this.drpStates.drpFromHash(lca.lca);
			await applyVertices(drp, drpVertices);
			Object.assign(this.drp, drp);
		}

		this._notify("merge", newVertices);
		return { applied: missing.length === 0, missing };
	}

	async merge(vertices: Vertex[]): Promise<MergeResult> {
		const { applied, missing } = await this.applyVertices(vertices);
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
