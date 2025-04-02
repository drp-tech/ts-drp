import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { Logger } from "@ts-drp/logger";
import {
	type CreateObjectOptions,
	type DRPObjectBase,
	type DRPObjectCallback,
	type DRPObjectOptions,
	DRPState,
	DRPStateEntry,
	DrpType,
	type FinalityConfig,
	type Hash,
	type IACL,
	type IDRP,
	type IDRPObject,
	type LoggerOptions,
	type LowestCommonAncestorResult,
	type MergeResult,
	Operation,
	Vertex,
} from "@ts-drp/types";
import { handlePromiseOrValue, isPromise, ObjectSet, processSequentially } from "@ts-drp/utils";
import { computeHash } from "@ts-drp/utils/hash";
import { validateVertex } from "@ts-drp/validation/vertex";
import { cloneDeep } from "es-toolkit";
import { deepEqual } from "fast-equals";

import { ObjectACL } from "./acl/index.js";
import { FinalityStore } from "./finality/index.js";
import { HashGraph } from "./hashgraph/index.js";

export * from "./acl/index.js";
export * from "./hashgraph/index.js";

// snake_casing to match the JSON config
export interface DRPObjectConfig {
	log_config?: LoggerOptions;
	finality_config?: FinalityConfig;
}

export let log: Logger;

interface OperationContext {
	operation: Operation;
	dependencies: Hash[];
	initialLCA: LowestCommonAncestorResult;
	timestamp: number;
	isACL: boolean;
	initialDRP: IDRP | IACL;
	maybeInitialDRP: IDRP | IACL | Promise<IDRP | IACL>;
	result: unknown;
}

/**
 * A class that implements the DRPObjectBase interface and IDRPObject<T> interface.
 * @template {IDRP} T - The type of the DRP object.
 */
export class DRPObject<T extends IDRP> implements DRPObjectBase, IDRPObject<T> {
	id: string;
	vertices: Vertex[] = [];
	acl: IACL;
	drp?: T;
	// @ts-expect-error: initialized in constructor
	hashGraph: HashGraph;
	// mapping from vertex hash to the DRP state
	drpStates: Map<string, DRPState>;
	aclStates: Map<string, DRPState>;
	originalDRP?: T;
	originalObjectACL?: IACL;
	finalityStore: FinalityStore;
	subscriptions: DRPObjectCallback<T>[] = [];

	/**
	 * Creates a new DRPObject instance.
	 * @param options - The options for the DRPObject.
	 */
	constructor(options: DRPObjectOptions<T>) {
		log = new Logger("drp::object", options.config?.log_config);
		this.id =
			options.id ??
			bytesToHex(
				sha256
					.create()
					.update(options.peerId)
					.update(Math.floor(Math.random() * Number.MAX_VALUE).toString())
					.digest()
			);

		const objAcl =
			options.acl ??
			new ObjectACL({
				admins: [options.peerId],
				permissionless: true,
			});
		this.acl = new Proxy(objAcl, this.proxyDRPHandler(DrpType.ACL));
		if (options.drp) {
			this._initLocalDrpInstance(options.peerId, options.drp, objAcl);
		} else {
			this._initNonLocalDrpInstance(options.peerId, objAcl);
		}

		this.aclStates = new Map([[HashGraph.rootHash, DRPState.create()]]);
		this.drpStates = new Map([[HashGraph.rootHash, DRPState.create()]]);
		this._setRootStates();

		this.finalityStore = new FinalityStore(options.config?.finality_config, options.config?.log_config);
		this.originalObjectACL = cloneDeep(objAcl);
		this.originalDRP = cloneDeep(options.drp);
		this.callFn = options.metrics?.traceFunc("drpObject.callFn", this.callFn.bind(this)) ?? this.callFn;
		this._computeObjectACL =
			options.metrics?.traceFunc("drpObject.computeObjectACL", this._computeObjectACL.bind(this)) ??
			this._computeObjectACL;
		this._computeDRP =
			options.metrics?.traceFunc("drpObject.computeDRP", this._computeDRP.bind(this)) ?? this._computeDRP;
	}

	private _initLocalDrpInstance(peerId: string, drp: T, acl: IACL): void {
		this.drp = new Proxy(drp, this.proxyDRPHandler(DrpType.DRP));
		this.hashGraph = new HashGraph(
			peerId,
			acl.resolveConflicts?.bind(acl),
			drp.resolveConflicts?.bind(drp),
			drp.semanticsType
		);
		this.vertices = this.hashGraph.getAllVertices();
	}

	private _initNonLocalDrpInstance(peerId: string, acl: IDRP): void {
		this.hashGraph = new HashGraph(peerId, acl.resolveConflicts?.bind(this.acl));
		this.vertices = this.hashGraph.getAllVertices();
	}

	/**
	 * Creates a new DRPObject instance.
	 * @param options - The options for the DRPObject.
	 * @returns The new DRPObject instance.
	 */
	static createObject<T extends IDRP>(options: CreateObjectOptions<T>): DRPObject<T> {
		const aclObj = new ObjectACL({
			admins: [],
			permissionless: true,
		});

		const object = new DRPObject({
			peerId: options.peerId,
			id: options.id,
			acl: aclObj,
			drp: options.drp,
			metrics: options.metrics,
			config: {
				log_config: options.log_config,
			},
		});
		return object;
	}

	/**
	 * Intercepts calls to the DRP object.
	 * @param vertexType - The type of the DRP object.
	 * @returns The proxy handler.
	 */
	proxyDRPHandler<T extends object>(vertexType: DrpType): ProxyHandler<T> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const obj = this;
		return {
			get(target: object, propKey: string | symbol, receiver: unknown): unknown {
				const value = Reflect.get(target, propKey, receiver);

				if (typeof value === "function") {
					const fullPropKey = String(propKey);
					return new Proxy(target[propKey as keyof object], {
						apply(
							applyTarget: (...args: unknown[]) => unknown,
							thisArg: unknown,
							args: unknown[]
						): unknown | Promise<unknown> {
							if ((propKey as string).startsWith("query_")) {
								return Reflect.apply(applyTarget, thisArg, args);
							}
							const callerName = new Error().stack?.split("\n")[2]?.trim().split(" ")[1];
							if (callerName?.startsWith("DRPObject.resolveConflicts")) {
								return Reflect.apply(applyTarget, thisArg, args);
							}
							if (!callerName?.startsWith("Proxy.")) {
								return obj.callFn(fullPropKey, args, vertexType);
							}
							return Reflect.apply(applyTarget, thisArg, args);
						},
					});
				}

				return value;
			},
		};
	}

	private _newOperationContext(operation: Operation): Omit<OperationContext, "initialDRP"> {
		const timestamp = Date.now();
		const isACL = operation.drpType === DrpType.ACL;
		const dependencies = this.hashGraph.getFrontier();
		const initialLCA = this.computeLCA(dependencies);
		const initialDRP = isACL
			? this._computeObjectACL(dependencies, initialLCA)
			: this._computeDRP(dependencies, initialLCA);

		return {
			operation,
			dependencies,
			initialLCA,
			timestamp,
			isACL,
			maybeInitialDRP: initialDRP,
			result: undefined,
		};
	}

	private callFn(fn: string, args: unknown, drpType: DrpType): unknown | Promise<unknown> {
		if (!this.hashGraph) {
			throw new Error("Hashgraph is undefined");
		}

		const operation = Operation.create({ drpType, opType: fn, value: args });
		const contextWithoutInitialDRP = this._newOperationContext(operation);

		return handlePromiseOrValue(contextWithoutInitialDRP.maybeInitialDRP, (drp) => {
			// mutate the context to have the resolved DRP
			const context: OperationContext = { ...contextWithoutInitialDRP, initialDRP: drp };
			return this._executeOperation(context);
		});
	}

	private _executeOperation(context: OperationContext): unknown | Promise<unknown> {
		const { initialDRP, operation } = context;
		if (!initialDRP) {
			throw new Error("Initial DRP is undefined");
		}

		const operationDRP = cloneDeep(initialDRP);
		let result: unknown | Promise<unknown> = undefined;
		try {
			result = this._applyOperation(operationDRP, operation, this.hashGraph.peerId);
		} catch (e) {
			log.error(`::drpObject::callFn: ${e}`);
			throw e;
		}

		return handlePromiseOrValue(result, (result) => {
			context.result = result;
			return this._processOperationResult(context, operationDRP);
		});
	}

	private _hasStateChanged(a: IDRP | IACL, b: IDRP | IACL): boolean {
		return Object.keys(a).some((key) => {
			if (key === "context") return false;
			return !deepEqual(a[key], b[key]);
		});
	}

	private _processOperationResult(
		context: OperationContext,
		postOperationDRP: IDRP | IACL
	): unknown | Promise<unknown> {
		const { initialDRP, result, operation, initialLCA, isACL, dependencies } = context;
		if (!initialDRP) {
			throw new Error("Initial DRP is undefined");
		}

		const stateChanged = this._hasStateChanged(initialDRP, postOperationDRP);
		// early return if the state has not changed
		if (!stateChanged) {
			return result;
		}

		const [postDRP, postACL] = isACL
			? [this._computeDRP(dependencies, initialLCA, operation), postOperationDRP as IACL]
			: [postOperationDRP, this._computeObjectACL(dependencies, initialLCA, operation)];

		if (isPromise(postDRP) || isPromise(postACL)) {
			return Promise.all([postDRP, postACL]).then(([drp, acl]) => this._processOperationUpdateState(context, drp, acl));
		}

		return this._processOperationUpdateState(context, postDRP, postACL);
	}

	private _processOperationUpdateState(
		context: OperationContext,
		postDRP: IDRP,
		postACL: IACL
	): unknown | Promise<unknown> {
		const { operation, timestamp, dependencies, initialLCA, isACL, result } = context;

		const vertex = this.hashGraph.createVertex(operation, dependencies, timestamp);
		this.hashGraph.addVertex(vertex);

		const [drpStateResult, aclStateResult] = [
			this._setDRPState(vertex, initialLCA, this._getDRPState(postDRP)),
			this._setObjectACLState(vertex, initialLCA, this._getDRPState(postACL)),
		];

		this._initializeFinalityState(vertex.hash, postACL);

		this.vertices.push(vertex);
		this._notify("callFn", [vertex]);

		if (!isACL) Object.assign(this.drp ?? {}, postDRP);
		else Object.assign(this.acl, postACL);

		if (isPromise(drpStateResult) || isPromise(aclStateResult)) {
			return Promise.all([drpStateResult, aclStateResult]).then(() => result);
		}

		return result;
	}

	/**
	 * Merges the vertices into the hashgraph
	 * Returns a tuple with a boolean indicating if there were
	 * missing vertices and an array with the missing vertices
	 * @param vertices - The vertices to merge
	 * @returns A tuple with a boolean indicating if there were missing vertices and an array with the missing vertices
	 */
	async merge(vertices: Vertex[]): Promise<MergeResult> {
		if (!this.hashGraph) {
			throw new Error("Hashgraph is undefined");
		}

		const missing: Hash[] = [];
		const newVertices: Vertex[] = [];
		for (const vertex of vertices) {
			// Check to avoid manually crafted `undefined` operations
			if (!vertex.operation || this.hashGraph.vertices.has(vertex.hash)) {
				continue;
			}

			try {
				const validation = validateVertex(vertex, this.hashGraph, Date.now());
				if (!validation.success) {
					throw validation.error
						? validation.error
						: new Error(`Vertex validation unknown error for vertex ${vertex.hash}`);
				}
				const preComputeLca = this.computeLCA(vertex.dependencies);

				const acl = this._computeObjectACL(
					vertex.dependencies,
					preComputeLca,
					vertex.operation.drpType === DrpType.ACL ? vertex.operation : undefined,
					vertex.peerId
				);
				if (vertex.operation?.drpType === DrpType.DRP && !acl.query_isWriter(vertex.peerId)) {
					throw new Error(`Vertex ${vertex.peerId} does not have write permission.`);
				}
				await this._setObjectACLState(vertex, preComputeLca, this._getDRPState(acl));

				if (this.drp) {
					const drp = await this._computeDRP(
						vertex.dependencies,
						preComputeLca,
						vertex.operation.drpType === DrpType.DRP ? vertex.operation : undefined,
						vertex.peerId
					);
					await this._setDRPState(vertex, preComputeLca, this._getDRPState(drp));
				}

				this.hashGraph.addVertex(vertex);
				this._initializeFinalityState(vertex.hash, acl);
				newVertices.push(vertex);
			} catch (_) {
				missing.push(vertex.hash);
			}
		}

		this.vertices = this.hashGraph.getAllVertices();
		await this._updateObjectACLState();
		if (this.drp) await this._updateDRPState();
		this._notify("merge", newVertices);

		return [missing.length === 0, missing];
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

	// initialize the attestation store for the given vertex hash
	private _initializeFinalityState(hash: Hash, acl: IACL): void {
		this.finalityStore.initializeState(hash, acl.query_getFinalitySigners());
	}

	// apply the operation to the DRP
	private _applyOperation(drp: IDRP, operation: Operation, caller: string): unknown | Promise<unknown> {
		const { opType, value } = operation;

		const typeParts = opType.split(".");
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let target: any = drp;
		for (let i = 0; i < typeParts.length - 1; i++) {
			target = target[typeParts[i]];
			if (!target) {
				throw new Error(`Invalid operation type: ${opType}`);
			}
		}

		if (target.context) {
			target.context.caller = caller;
		}

		const methodName = typeParts[typeParts.length - 1];
		if (typeof target[methodName] !== "function") {
			throw new Error(`${opType} is not a function`);
		}

		try {
			return target[methodName](...value);
		} catch (e) {
			throw new Error(`Error while applying operation ${opType}: ${e}`);
		}
	}

	// compute the DRP based on all dependencies of the current vertex using partial linearization
	private _computeDRP(
		vertexDependencies: Hash[],
		preCompute?: LowestCommonAncestorResult,
		vertexOperation?: Operation,
		caller?: string
	): IDRP | Promise<IDRP> {
		if (!this.drp || !this.originalDRP) {
			throw new Error("DRP is undefined");
		}

		const { lca, linearizedVertices } = preCompute ?? this.computeLCA(vertexDependencies);

		const drp: IDRP = cloneDeep(this.originalDRP);

		const fetchedState = this.drpStates.get(lca);
		if (!fetchedState) {
			throw new Error("State is undefined");
		}

		const state = cloneDeep(fetchedState);

		for (const entry of state.state) {
			drp[entry.key] = entry.value;
		}
		const operations: [Operation, string][] = [];
		for (const vertex of linearizedVertices) {
			if (vertex.operation && vertex.operation.drpType === DrpType.DRP) {
				operations.push([vertex.operation, vertex.peerId]);
			}
		}
		if (vertexOperation && vertexOperation.drpType === DrpType.DRP) {
			if (!caller) {
				throw new Error("Caller is undefined");
			}
			operations.push([vertexOperation, caller]);
		}

		return processSequentially(
			operations,
			([op, caller]: [Operation, string]) => this._applyOperation(drp, op, caller),
			drp
		);
	}

	private _computeObjectACL(
		vertexDependencies: Hash[],
		preCompute?: LowestCommonAncestorResult,
		vertexOperation?: Operation,
		caller?: string
	): IACL {
		if (!this.acl || !this.originalObjectACL) {
			throw new Error("ObjectACL is undefined");
		}

		const { lca, linearizedVertices } = preCompute ?? this.computeLCA(vertexDependencies);

		const acl = cloneDeep(this.originalObjectACL);

		const fetchedState = this.aclStates.get(lca);
		if (!fetchedState) {
			throw new Error("State is undefined");
		}

		const state = cloneDeep(fetchedState);

		for (const entry of state.state) {
			acl[entry.key] = entry.value;
		}

		const operations: [Operation, string][] = [];
		for (const v of linearizedVertices) {
			if (v.operation && v.operation.drpType === DrpType.ACL) {
				operations.push([v.operation, v.peerId]);
			}
		}

		if (vertexOperation && vertexOperation.drpType === DrpType.ACL) {
			if (!caller) {
				throw new Error("Caller is undefined");
			}
			operations.push([vertexOperation, caller]);
		}

		for (const [op, caller] of operations) {
			this._applyOperation(acl, op, caller);
		}

		return acl;
	}

	private computeLCA(vertexDependencies: string[]): LowestCommonAncestorResult {
		if (!this.hashGraph) {
			throw new Error("Hashgraph is undefined");
		}

		const subgraph: ObjectSet<Hash> = new ObjectSet();
		const lca =
			vertexDependencies.length === 1
				? vertexDependencies[0]
				: this.hashGraph.lowestCommonAncestorMultipleVertices(vertexDependencies, subgraph);
		const linearizedVertices = vertexDependencies.length === 1 ? [] : this.hashGraph.linearizeVertices(lca, subgraph);
		return { lca, linearizedVertices };
	}

	// get the map representing the state of the given DRP by mapping variable names to their corresponding values
	private _getDRPState(drp: IDRP): DRPState {
		const varNames: string[] = Object.keys(drp);
		const drpState: DRPState = DRPState.create({
			state: [],
		});
		for (const varName of varNames) {
			drpState.state.push(
				DRPStateEntry.create({
					key: varName,
					value: drp[varName],
				})
			);
		}
		return drpState;
	}

	private _computeDRPState(
		vertexDependencies: Hash[],
		preCompute?: LowestCommonAncestorResult,
		vertexOperation?: Operation,
		caller?: string
	): DRPState | Promise<DRPState> {
		const drp = this._computeDRP(vertexDependencies, preCompute, vertexOperation, caller);
		return isPromise(drp) ? drp.then(this._getDRPState) : this._getDRPState(drp);
	}

	private _computeObjectACLState(
		vertexDependencies: Hash[],
		preCompute?: LowestCommonAncestorResult,
		vertexOperation?: Operation,
		caller?: string
	): DRPState {
		const acl = this._computeObjectACL(vertexDependencies, preCompute, vertexOperation, caller);
		return this._getDRPState(acl);
	}

	private _setObjectACLState(
		vertex: Vertex,
		preCompute?: LowestCommonAncestorResult,
		drpState?: DRPState
	): void | Promise<void> {
		if (this.acl) {
			const stateComputation =
				drpState ?? this._computeObjectACLState(vertex.dependencies, preCompute, vertex.operation, vertex.peerId);

			return handlePromiseOrValue(stateComputation, (state) => {
				this.aclStates.set(vertex.hash, state);
			});
		}
	}

	private _setDRPState(
		vertex: Vertex,
		preCompute?: LowestCommonAncestorResult,
		drpState?: DRPState
	): void | Promise<void> {
		const stateComputation =
			drpState ?? this._computeDRPState(vertex.dependencies, preCompute, vertex.operation, vertex.peerId);

		return handlePromiseOrValue(stateComputation, (state) => {
			this.drpStates.set(vertex.hash, state);
		});
	}

	private _updateState(drp: IDRP, state: DRPState): void {
		for (const entry of state.state) {
			if (entry.key in drp && typeof drp[entry.key] !== "function") {
				drp[entry.key] = entry.value;
			}
		}
	}

	// update the DRP's attributes based on all the vertices in the hashgraph
	private _updateDRPState(): void | Promise<void> {
		if (!this.drp || !this.hashGraph) {
			throw new Error("DRP or hashgraph is undefined");
		}
		const currentDRP = this.drp as IDRP;
		const newState = this._computeDRPState(this.hashGraph.getFrontier());
		return handlePromiseOrValue(newState, (state) => {
			this._updateState(currentDRP, state);
		});
	}

	private _updateObjectACLState(): void | Promise<void> {
		if (!this.acl || !this.hashGraph) {
			throw new Error("ObjectACL or hashgraph is undefined");
		}
		const newState = this._computeObjectACLState(this.hashGraph.getFrontier());
		return handlePromiseOrValue(newState, (state) => {
			this._updateState(this.acl, state);
		});
	}

	private _setRootStates(): void {
		const aclState = [];
		for (const key of Object.keys(this.acl)) {
			if (typeof this.acl[key] !== "function") {
				aclState.push(
					DRPStateEntry.create({
						key,
						value: cloneDeep(this.acl[key]),
					})
				);
			}
		}
		const drp = (this.drp as IDRP) ?? {};
		const drpState = [];
		for (const key of Object.keys(drp)) {
			if (typeof drp[key] !== "function") {
				drpState.push(
					DRPStateEntry.create({
						key,
						value: cloneDeep(drp[key]),
					})
				);
			}
		}
		this.aclStates.set(HashGraph.rootHash, { state: aclState });
		this.drpStates.set(HashGraph.rootHash, { state: drpState });
	}
}

/**
 * Creates a new vertex.
 * @param peerId - The peer ID.
 * @param operation - The operation.
 * @param dependencies - The dependencies.
 * @param timestamp - The timestamp.
 * @param signature - The signature.
 * @returns The new vertex.
 */
export function newVertex(
	peerId: string,
	operation: Operation,
	dependencies: Hash[],
	timestamp: number,
	signature: Uint8Array
): Vertex {
	const hash = computeHash(peerId, operation, dependencies, timestamp);
	return Vertex.create({
		hash,
		peerId,
		operation,
		dependencies,
		timestamp,
		signature,
	});
}
