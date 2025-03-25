import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { Logger } from "@ts-drp/logger";
import {
	type ApplyResult,
	type DRPObjectCallback2,
	type DRPObjectOptions,
	DrpType,
	type Hash,
	type IACL,
	type IDRP,
	type IDRPObject2,
	type IHashGraph,
	type LoggerOptions,
	type LowestCommonAncestorResult,
	type MergeResult,
	type Vertex,
} from "@ts-drp/types";
import { handlePromiseOrValue, isPromise, processSequentially2, processSequentially3 } from "@ts-drp/utils";
import { cloneDeep } from "es-toolkit";
import { deepEqual } from "fast-equals";

import { ObjectACL } from "./acl/index.js";
import { FinalityStore } from "./finality/index.js";
import { HashGraph, OperationType } from "./hashgraph/index.js";
import { StopableChain } from "./proxy/chainable.js";
import { DRPProxy, type DRPProxyBeforeChainArgs } from "./proxy/proxy.js";
import { DRPObjectStateManager } from "./state.js";
import { validateVertexDependencies, validateVertexHash, validateVertexTimestamp } from "./vertex-validation.js";

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

function callDRP<T extends IDRP>(drp: T, caller: string, method: string, args: unknown[]): unknown | Promise<unknown> {
	if (drp.context) drp.context.caller = caller;

	return drp[method](...args);
}

function applyVertex<T extends IDRP>(drp: T, v: Vertex): unknown | Promise<unknown> {
	const { operation, peerId } = v;
	if (!operation) throw new Error("Operation is undefined");

	return callDRP(drp, peerId, operation.opType, operation.value);
}

function applyVertices<T extends IDRP>(drp: T, vertices: Vertex[]): unknown | Promise<unknown> {
	return processSequentially2(vertices, (drp, v) => applyVertex(drp, v), drp);
}

interface Operation<T extends IDRP> {
	vertex: Vertex;
	// this is the same as the lca of ACLResult
	lca: LowestCommonAncestorResult;
	drpVertices: Vertex[];
	aclVertices: Vertex[];
	acl: IACL;
	/*
	 **	lcaWithDepsDRP is the DRP with the state of the lca with the dependencies applied
	 ** so it is the state of the object before the operation
	 */
	lcaWithDepsDRP: T;
	currentDRP: T;
}

interface OperationForACL<T extends IDRP> extends Operation<T> {
	drp?: IDRP;
}

interface DRPSubObjectOptions<T extends IDRP> extends BaseSubObjectOptions<T> {
	aclStates: DRPObjectStateManager<IACL>;
}

interface ACLSubObjectOptions<T extends IACL> extends BaseSubObjectOptions<T> {
	drpStates?: DRPObjectStateManager<IDRP>;
}

interface BaseSubObjectOptions<T extends IDRP> {
	drp: T;
	hg: IHashGraph;
	type: DrpType;
	localPeerID: string;
	finalityStore: FinalityStore;
	states?: DRPObjectStateManager<T>;
	logConfig?: LoggerOptions;
	notify(origin: string, vertices: Vertex[]): void;
}

function splitOperation(vertices: Vertex[]): [Vertex[], Vertex[]] {
	const drpVertices: Vertex[] = [];
	const aclVertices: Vertex[] = [];

	for (const v of vertices) {
		if (!v.operation) {
			continue;
		}

		if (v.operation?.drpType === DrpType.DRP) {
			drpVertices.push(v);
			continue;
		}
		aclVertices.push(v);
	}

	return [drpVertices, aclVertices];
}

abstract class BaseSubObject<T extends IDRP, Op extends Operation<T> = Operation<T>> {
	private proxy: DRPProxy<T, Op>;
	protected readonly hg: IHashGraph;
	protected readonly states: DRPObjectStateManager<T>;
	private readonly type: DrpType;
	private logger: Logger;
	private beforeCallbackVertex: StopableChain<Vertex, Op>;
	private afterCallback: StopableChain<ReturnType<typeof this.beforeCallbackVertex.execute>>;
	private finalityStore: FinalityStore;
	private _notify: (origin: string, vertices: Vertex[]) => void;

	get drp(): T {
		return this.proxy.proxy;
	}

	constructor({ drp, hg, type, states, logConfig, finalityStore, notify }: BaseSubObjectOptions<T>) {
		this.hg = hg;
		this.type = type;
		this.states = states ?? new DRPObjectStateManager(drp);
		this.logger = new Logger(`drp::subobject::${type}`, logConfig ?? { level: "info" });
		this.finalityStore = finalityStore;
		this._notify = notify;

		const beforeCallback = new StopableChain<DRPProxyBeforeChainArgs>()
			.then(this.createVertex.bind(this))
			.then(this.validateVertex.bind(this))
			.then(this.splitOperation.bind(this))
			.then(this.computeOperation.bind(this))
			.then(this.validateACL.bind(this));

		const afterCallback = new StopableChain<Op>()
			.then(this.equal.bind(this))
			.then(this.assign.bind(this))
			.then(this.assignToHashGraph.bind(this))
			.then(this.assignState.bind(this))
			.then(this.initializeFinalityStore.bind(this))
			.then(this.notify.bind(this));

		this.beforeCallbackVertex = new StopableChain<Vertex>()
			.then(this.validateVertex.bind(this))
			.then(this.splitOperation.bind(this))
			.then(this.computeOperation.bind(this))
			.then(this.validateACL.bind(this));

		// since we know that apply can await there we can directly use the Op type instead of the return type of the previous chain which is op | Promise<Op>
		this.afterCallback = new StopableChain<Op>()
			.then(this.initializeFinalityStore.bind(this))
			.then(this.assignToHashGraph.bind(this))
			.then(this.assignState.bind(this));

		this.proxy = new DRPProxy(drp, beforeCallback, afterCallback, this.applyFn.bind(this));
	}

	async applies(v: Vertex[]): Promise<Op | undefined> {
		const operation = await processSequentially3(v, this.apply.bind(this));
		const frontier = this.hg.getFrontier();
		const lca = this.hg.getLCA(frontier);
		const drp = this.states.drpFromHash(lca.lca);
		const [drpVertices, aclVertices] = splitOperation(lca.linearizedVertices);
		let ops = aclVertices;
		if (this.type !== DrpType.ACL) {
			ops = drpVertices;
		}
		await applyVertices(drp, ops);
		Object.assign(this.proxy.proxy, drp);
		return operation;
	}

	async apply(v: Vertex): Promise<Op | undefined> {
		if (!v.operation || this.hg.vertices.has(v.hash)) return;

		const operation = await this.beforeCallbackVertex.execute(v);

		if (!operation.vertex.operation) return;

		await this.applyFn(operation, operation.vertex.operation.opType, operation.vertex.operation.value);

		await this.afterCallback.execute(operation);
		return operation;
	}

	protected abstract computeOperation(
		operation: Pick<Op, "drpVertices" | "aclVertices" | "vertex" | "lca">
	): [Op, boolean] | Promise<[Op, boolean]>;

	private validateACL(operation: Op): [Op, boolean] {
		const {
			acl,
			vertex: { peerId },
		} = operation;
		const isWriter = acl.query_isWriter(peerId);
		if (!isWriter) throw new Error("Not a writer");
		return [operation, true];
	}

	private createVertex({ prop, args }: DRPProxyBeforeChainArgs): [Vertex, boolean] {
		const vertex = this.hg.createVertex2({
			drpType: this.type,
			opType: prop,
			value: args,
		});

		return [vertex, true];
	}

	private validateVertex(v: Vertex): [Vertex, boolean] {
		validateVertexHash(v);
		validateVertexDependencies(v, this.hg);
		validateVertexTimestamp(v.timestamp, Date.now(), v.hash);
		return [v, true];
	}

	private initializeFinalityStore(operation: Op): [Op, boolean] {
		const { vertex, acl } = operation;
		this.finalityStore.initializeState(vertex.hash, acl.query_getFinalitySigners());
		return [operation, true];
	}

	private splitOperation(v: Vertex): [Pick<Op, "drpVertices" | "aclVertices" | "vertex" | "lca">, boolean] {
		const lca = this.hg.getLCA(v.dependencies);
		if (this.hg.peerId === "peer1") {
			console.log("-------2------------------------");
			console.log("splitOperation", lca.lca, lca.linearizedVertices);
			console.log("-------2------------------------");
		}
		const [drpVertices, aclVertices] = splitOperation(lca.linearizedVertices);
		return [
			{
				drpVertices,
				aclVertices,
				vertex: v,
				lca,
			},
			true,
		];
	}

	private equal(operation: Op): [Op, boolean] {
		const { lcaWithDepsDRP, currentDRP } = operation;
		const changed = Object.keys(currentDRP).some((key) => {
			if (key === "context") return false;

			return !deepEqual(lcaWithDepsDRP[key], currentDRP[key]);
		});

		if (this.hg.peerId === "peer1") {
			console.log("equal", lcaWithDepsDRP, currentDRP);
		}
		return [operation, changed];
	}

	private assignToHashGraph(operation: Op): [Op, boolean] {
		const { vertex } = operation;

		this.hg.addVertex(vertex);
		return [operation, true];
	}

	protected assignState(operation: Op): [Op, boolean] {
		const { currentDRP, vertex } = operation;
		const { hash } = vertex;
		if (this.hg.peerId === "peer1") {
			console.log("assignState", hash, currentDRP);
		}
		this.states.setState(hash, currentDRP);
		return [operation, true];
	}

	protected assign(operation: Op): [Op, boolean] {
		const { currentDRP } = operation;
		if (this.hg.peerId === "peer1") {
			console.log("assign", currentDRP);
		}
		Object.assign(this.proxy.proxy, currentDRP);

		return [operation, true];
	}

	private applyFn(operation: Op, methodName: string, args: unknown[]): unknown | Promise<unknown> {
		const {
			currentDRP,
			vertex: { peerId },
		} = operation;

		return handlePromiseOrValue(callDRP(currentDRP, peerId, methodName, args));
	}

	private notify(operation: Op): [undefined, boolean] {
		this._notify("callFn", [operation.vertex]);
		return [undefined, true];
	}
}

export class DRPSubObject<T extends IDRP> extends BaseSubObject<T> {
	private readonly aclStates: DRPObjectStateManager<IACL>;

	constructor(options: DRPSubObjectOptions<T>) {
		super(options);
		this.aclStates = options.aclStates;
	}

	protected computeOperation(
		operation: Pick<Operation<T>, "drpVertices" | "aclVertices" | "vertex" | "lca">
	): [Operation<T>, boolean] | Promise<[Operation<T>, boolean]> {
		const { lca } = operation;
		const acl = this.aclStates.drpFromHash(lca.lca);
		const drp = this.states.drpFromHash(lca.lca);
		// here we need to wait for the drp to be applied as we don't know if this is a sync or async operation
		if (this.hg.peerId === "peer1") {
			console.log("--------------------------------");
			console.log("computeOperation", operation.vertex.hash, drp, operation.drpVertices);
			console.log("--------------------------------");
		}
		const p = applyVertices<T>(drp, operation.drpVertices);
		applyVertices(acl, operation.aclVertices);
		if (isPromise(p)) {
			return p.then((): [Operation<T>, boolean] => [
				{
					...operation,
					acl,
					lcaWithDepsDRP: drp,
					currentDRP: cloneDeep(drp),
				},
				true,
			]);
		}
		return [
			{
				...operation,
				acl,
				lcaWithDepsDRP: drp,
				currentDRP: cloneDeep(drp),
			},
			true,
		];
	}

	protected assignState(operation: Operation<T>): [Operation<T>, boolean] {
		super.assignState(operation);
		// this need to be done better
		this.aclStates.setState(operation.vertex.hash, operation.acl);
		return [operation, true];
	}

	protected assign(operation: Operation<T>): [Operation<T>, boolean] {
		super.assign(operation);
		// this need to be done better
		this.aclStates.setState(operation.vertex.hash, operation.acl);
		return [operation, true];
	}
}

class ACLSubObject<T extends IACL> extends BaseSubObject<T, OperationForACL<T>> {
	private readonly drpStates?: DRPObjectStateManager<IDRP>;

	constructor(options: ACLSubObjectOptions<T>) {
		super(options);
		this.drpStates = options.drpStates;
	}

	protected computeOperation(
		incomingOperation: Pick<OperationForACL<T>, "drpVertices" | "aclVertices" | "vertex" | "lca">
	): [OperationForACL<T>, boolean] {
		const { lca } = incomingOperation;
		const acl = this.states.drpFromHash(lca.lca);
		applyVertices(acl, incomingOperation.aclVertices);

		const operation: OperationForACL<T> = {
			...incomingOperation,
			acl,
			lcaWithDepsDRP: acl,
			currentDRP: cloneDeep(acl),
		};
		if (this.drpStates) {
			operation.drp = this.drpStates.drpFromHash(lca.lca);
			// TODO: need to wait for the drp to be applied as we don't know if this is a sync or async operation
			applyVertices(operation.drp, incomingOperation.drpVertices);
		}

		return [operation, true];
	}

	protected assign(operation: OperationForACL<T>): [OperationForACL<T>, boolean] {
		super.assign(operation);
		// since we are with a new ACL, we need to update the finality store with the new one
		operation.acl = operation.currentDRP;
		// this need to be done better
		if (operation.drp && this.drpStates) {
			this.drpStates.setState(operation.vertex.hash, operation.drp);
		}
		return [operation, true];
	}

	protected assignState(operation: OperationForACL<T>): [OperationForACL<T>, boolean] {
		super.assignState(operation);
		// since we are with a new ACL, we need to update the finality store with the new one
		operation.acl = operation.currentDRP;
		// this need to be done better
		if (operation.drp && this.drpStates) {
			this.drpStates.setState(operation.vertex.hash, operation.drp);
		}
		return [operation, true];
	}
}

export class DRPObject2<T extends IDRP> implements IDRPObject2<T> {
	readonly id: string;
	private readonly log: Logger;
	private readonly hg: HashGraph;

	private _acl: ACLSubObject<IACL>;
	private _drp?: DRPSubObject<T>;
	private subscriptions: DRPObjectCallback2<T>[] = [];
	private aclStates: DRPObjectStateManager<IACL>;
	private drpStates?: DRPObjectStateManager<T>;

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

		const finalityStore = new FinalityStore(config?.finality_config, config?.log_config);

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
			finalityStore,
			notify: this._notify.bind(this),
		});

		if (drp) {
			this._drp = new DRPSubObject({
				drp,
				hg: this.hg,
				type: DrpType.DRP,
				localPeerID: peerId,
				aclStates: this.aclStates,
				states: this.drpStates,
				finalityStore,
				notify: this._notify.bind(this),
			});
		}
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

	async applyVertices(vertices: Vertex[]): Promise<ApplyResult> {
		const missing: Hash[] = [];
		const newVertices: Vertex[] = [];

		for (const v of vertices) {
			if (!v.operation || this.hg.vertices.has(v.hash)) {
				//this.log.warn("Vertex has no operation", v);
				continue;
			}

			if (v.operation.opType === OperationType.NOP) continue;

			try {
				if (v.operation.drpType === DrpType.ACL) {
					await this._acl.apply(v);
					newVertices.push(v);
					continue;
				}

				await this._drp?.apply(v);
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
