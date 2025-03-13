import { Logger } from "@ts-drp/logger";
import {
	type ConnectObjectOptions,
	type DRPObjectBase,
	type DRPObjectCallback,
	DRPState,
	DRPStateEntry,
	DrpType,
	type Hash,
	type IACL,
	type IDRP,
	type IDRPObject,
	type IMetrics,
	type LoggerOptions,
	type LowestCommonAncestorResult,
	type Operation,
	type Vertex,
} from "@ts-drp/types";
import { handlePromiseOrValue, isPromise, processSequentially } from "@ts-drp/utils";
import { cloneDeep } from "es-toolkit";
import { deepEqual } from "fast-equals";
import * as crypto from "node:crypto";

import { ObjectACL } from "./acl/index.js";
import { type FinalityConfig, FinalityStore } from "./finality/index.js";
import { HashGraph } from "./hashgraph/index.js";
import { computeHash } from "./utils/computeHash.js";
import { ObjectSet } from "./utils/objectSet.js";

export * from "./utils/serializer.js";
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

export class DRPObject implements DRPObjectBase, IDRPObject {
	id: string;
	vertices: Vertex[] = [];
	acl?: ProxyHandler<IACL>;
	drp?: ProxyHandler<IDRP>;
	// @ts-expect-error: initialized in constructor
	hashGraph: HashGraph;
	// mapping from vertex hash to the DRP state
	drpStates: Map<string, DRPState>;
	aclStates: Map<string, DRPState>;
	originalDRP?: IDRP;
	originalObjectACL?: IACL;
	finalityStore: FinalityStore;
	subscriptions: DRPObjectCallback[] = [];

	constructor(options: {
		peerId: string;
		acl?: IACL;
		drp?: IDRP;
		id?: string;
		config?: DRPObjectConfig;
		metrics?: IMetrics;
	}) {
		log = new Logger("drp::object", options.config?.log_config);
		this.id =
			options.id ??
			crypto
				.createHash("sha256")
				.update(options.peerId)
				.update(Math.floor(Math.random() * Number.MAX_VALUE).toString())
				.digest("hex");

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

		this.finalityStore = new FinalityStore(options.config?.finality_config);
		this.originalObjectACL = cloneDeep(objAcl);
		this.originalDRP = cloneDeep(options.drp);
		this.callFn =
			options.metrics?.traceFunc("drpObject.callFn", this.callFn.bind(this)) ?? this.callFn;
		this._computeObjectACL =
			options.metrics?.traceFunc("drpObject.computeObjectACL", this._computeObjectACL.bind(this)) ??
			this._computeObjectACL;
		this._computeDRP =
			options.metrics?.traceFunc("drpObject.computeDRP", this._computeDRP.bind(this)) ??
			this._computeDRP;
	}

	private _initLocalDrpInstance(peerId: string, drp: IDRP, acl: IDRP): void {
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

	static createObject(options: ConnectObjectOptions): DRPObject {
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

	// This function is black magic, it allows us to intercept calls to the DRP object
	proxyDRPHandler(vertexType: DrpType): ProxyHandler<object> {
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

		const operation: Operation = { drpType, opType: fn, value: args };
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
			result = this._applyOperation(operationDRP, operation);
		} catch (e) {
			log.error(`::drpObject::callFn: ${e}`);
			return result;
		}

		return handlePromiseOrValue(result, (result) => {
			context.result = result;
			return this._processOperationResult(context, operationDRP);
		});
	}

	private _hasStateChanged(a: IDRP | IACL, b: IDRP | IACL): boolean {
		return Object.keys(a).some((key) => !deepEqual(a[key], b[key]));
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
			? [this._computeDRP(dependencies, initialLCA, operation), postOperationDRP]
			: [postOperationDRP, this._computeObjectACL(dependencies, initialLCA, operation)];

		if (isPromise(postDRP) || isPromise(postACL)) {
			return Promise.all([postDRP, postACL]).then(([drp, acl]) =>
				this._processOperationUpdateState(context, drp as IDRP, acl as IACL)
			);
		}

		return this._processOperationUpdateState(context, postDRP as IDRP, postACL as IACL);
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

		if (!isACL) Object.assign(this.drp as IDRP, postDRP);
		else Object.assign(this.acl as ObjectACL, postACL);

		if (isPromise(drpStateResult) || isPromise(aclStateResult)) {
			return Promise.all([drpStateResult, aclStateResult]).then(() => result);
		}

		return result;
	}

	validateVertex(vertex: Vertex): void {
		// Validate hash value
		if (
			vertex.hash !==
			computeHash(vertex.peerId, vertex.operation, vertex.dependencies, vertex.timestamp)
		) {
			throw new Error(`Invalid hash for vertex ${vertex.hash}`);
		}

		// Validate vertex dependencies
		if (vertex.dependencies.length === 0) {
			throw new Error(`Vertex ${vertex.hash} has no dependencies.`);
		}
		for (const dep of vertex.dependencies) {
			const depVertex = this.hashGraph.vertices.get(dep);
			if (depVertex === undefined) {
				throw new Error(`Vertex ${vertex.hash} has invalid dependency ${dep}.`);
			}
			if (depVertex.timestamp > vertex.timestamp) {
				// Vertex's timestamp must not be less than any of its dependencies' timestamps
				throw new Error(`Vertex ${vertex.hash} has invalid timestamp.`);
			}
		}
		if (vertex.timestamp > Date.now()) {
			// Vertex created in the future is invalid
			throw new Error(`Vertex ${vertex.hash} has invalid timestamp.`);
		}

		// Validate writer permission
		if (
			vertex.operation?.drpType === DrpType.DRP &&
			!this._checkWriterPermission(vertex.peerId, vertex.dependencies)
		) {
			throw new Error(`Vertex ${vertex.peerId} does not have write permission.`);
		}
	}

	/**
	 * Merges the vertices into the hashgraph
	 * Returns a tuple with a boolean indicating if there were
	 * missing vertices and an array with the missing vertices
	 *
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
				this.validateVertex(vertex);
				const preComputeLca = this.computeLCA(vertex.dependencies);

				if (this.drp) {
					const drp = await this._computeDRP(
						vertex.dependencies,
						preComputeLca,
						vertex.operation.drpType === DrpType.DRP ? vertex.operation : undefined
					);
					await this._setDRPState(vertex, preComputeLca, this._getDRPState(drp));
				}

				const acl = await this._computeObjectACL(
					vertex.dependencies,
					preComputeLca,
					vertex.operation.drpType === DrpType.ACL ? vertex.operation : undefined
				);
				await this._setObjectACLState(vertex, preComputeLca, this._getDRPState(acl));

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

	subscribe(callback: DRPObjectCallback): void {
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

	// check if the given peer has write permission
	private _checkWriterPermission(peerId: string, deps: Hash[]): boolean {
		const acl = this._computeObjectACL(deps);
		return (acl as IACL).query_isWriter(peerId);
	}

	// apply the operation to the DRP
	private _applyOperation(drp: IDRP, operation: Operation): unknown | Promise<unknown> {
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
		vertexOperation?: Operation
	): IDRP | Promise<IDRP> {
		if (!this.drp || !this.originalDRP) {
			throw new Error("DRP is undefined");
		}

		const { lca, linearizedVertices } = preCompute ?? this.computeLCA(vertexDependencies);

		const drp = cloneDeep(this.originalDRP);

		const fetchedState = this.drpStates.get(lca);
		if (!fetchedState) {
			throw new Error("State is undefined");
		}

		const state = cloneDeep(fetchedState);

		for (const entry of state.state) {
			drp[entry.key] = entry.value;
		}
		const operations: Operation[] = [];
		for (const vertex of linearizedVertices) {
			if (vertex.operation && vertex.operation.drpType === DrpType.DRP) {
				operations.push(vertex.operation);
			}
		}
		if (vertexOperation && vertexOperation.drpType === DrpType.DRP) {
			operations.push(vertexOperation);
		}

		return processSequentially(operations, (op: Operation) => this._applyOperation(drp, op), drp);
	}

	private _computeObjectACL(
		vertexDependencies: Hash[],
		preCompute?: LowestCommonAncestorResult,
		vertexOperation?: Operation
	): IACL | Promise<IACL> {
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

		const operations: Operation[] = [];
		for (const v of linearizedVertices) {
			if (v.operation && v.operation.drpType === DrpType.ACL) {
				operations.push(v.operation);
			}
		}

		if (vertexOperation && vertexOperation.drpType === DrpType.ACL) {
			operations.push(vertexOperation);
		}

		return processSequentially(operations, (op: Operation) => this._applyOperation(acl, op), acl);
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
		const linearizedVertices =
			vertexDependencies.length === 1 ? [] : this.hashGraph.linearizeVertices(lca, subgraph);
		return { lca, linearizedVertices };
	}

	// get the map representing the state of the given DRP by mapping variable names to their corresponding values
	private _getDRPState(drp: IDRP): DRPState {
		const varNames: string[] = Object.keys(drp);
		const drpState: DRPState = {
			state: [],
		};
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
		vertexOperation?: Operation
	): DRPState | Promise<DRPState> {
		const drp = this._computeDRP(vertexDependencies, preCompute, vertexOperation);
		return isPromise(drp) ? drp.then(this._getDRPState) : this._getDRPState(drp);
	}

	private _computeObjectACLState(
		vertexDependencies: Hash[],
		preCompute?: LowestCommonAncestorResult,
		vertexOperation?: Operation
	): DRPState | Promise<DRPState> {
		const acl = this._computeObjectACL(vertexDependencies, preCompute, vertexOperation);
		return isPromise(acl) ? acl.then(this._getDRPState) : this._getDRPState(acl);
	}

	private _setObjectACLState(
		vertex: Vertex,
		preCompute?: LowestCommonAncestorResult,
		drpState?: DRPState
	): void | Promise<void> {
		if (this.acl) {
			const stateComputation =
				drpState ?? this._computeObjectACLState(vertex.dependencies, preCompute, vertex.operation);

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
			drpState ?? this._computeDRPState(vertex.dependencies, preCompute, vertex.operation);

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
		const currentObjectACL = this.acl as IACL;
		const newState = this._computeObjectACLState(this.hashGraph.getFrontier());
		return handlePromiseOrValue(newState, (state) => {
			this._updateState(currentObjectACL, state);
		});
	}

	private _setRootStates(): void {
		const acl = this.acl as IACL;
		const aclState = [];
		for (const key of Object.keys(acl)) {
			if (typeof acl[key] !== "function") {
				aclState.push(
					DRPStateEntry.create({
						key,
						value: cloneDeep(acl[key]),
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

export function newVertex(
	peerId: string,
	operation: Operation,
	dependencies: Hash[],
	timestamp: number,
	signature: Uint8Array
): Vertex {
	const hash = computeHash(peerId, operation, dependencies, timestamp);
	return {
		hash,
		peerId,
		operation,
		dependencies,
		timestamp,
		signature,
	};
}
