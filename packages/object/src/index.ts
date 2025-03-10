import { Logger } from "@ts-drp/logger";
import {
	type ConnectObjectOptions,
	type DRPObjectBase,
	type DRPObjectCallback,
	type DRPPublicCredential,
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
		publicCredential?: DRPPublicCredential;
		acl?: IACL;
		drp?: IDRP;
		id?: string;
		config?: DRPObjectConfig;
		metrics?: IMetrics;
	}) {
		if (!options.acl && !options.publicCredential) {
			throw new Error("Either publicCredential or acl must be provided to create a DRPObject");
		}

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
				admins: new Map([[options.peerId, options.publicCredential as DRPPublicCredential]]),
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
			admins: new Map(),
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
						): unknown {
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

	private callFn(
		fn: string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		args: any,
		drpType: DrpType
	): void {
		if (!this.hashGraph) {
			throw new Error("Hashgraph is undefined");
		}

		const isACL = drpType === DrpType.ACL;
		const vertexDependencies = this.hashGraph.getFrontier();
		const vertexOperation = { drpType, opType: fn, value: args };
		const preComputeLca = this.computeLCA(vertexDependencies);
		const now = Date.now();
		const preOperationDRP = isACL
			? this._computeObjectACL(vertexDependencies)
			: this._computeDRP(vertexDependencies);

		const clonedDRP = cloneDeep(preOperationDRP);
		let appliedOperationResult = undefined;
		try {
			appliedOperationResult = this._applyOperation(clonedDRP, vertexOperation);
		} catch (e) {
			log.error(`::drpObject::callFn: ${e}`);
			return appliedOperationResult;
		}

		const stateChanged = Object.keys(preOperationDRP).some(
			(key) => !deepEqual(preOperationDRP[key], clonedDRP[key])
		);
		if (!stateChanged) {
			return appliedOperationResult;
		}

		const [drp, acl] = isACL
			? [this._computeDRP(vertexDependencies, preComputeLca), clonedDRP as IACL]
			: [clonedDRP as IDRP, this._computeObjectACL(vertexDependencies, preComputeLca)];

		const vertex = this.hashGraph.createVertex(vertexOperation, vertexDependencies, now);

		this.hashGraph.addVertex(vertex);
		this._setDRPState(vertex, preComputeLca, this._getDRPState(drp));
		this._setObjectACLState(vertex, preComputeLca, this._getDRPState(acl));
		this._initializeFinalityState(vertex.hash, acl);

		this.vertices.push(vertex);
		this._notify("callFn", [vertex]);

		if (!isACL) Object.assign(this.drp as IDRP, clonedDRP);
		else Object.assign(this.acl as ObjectACL, clonedDRP);

		return appliedOperationResult;
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

	/* Merges the vertices into the hashgraph
	 * Returns a tuple with a boolean indicating if there were
	 * missing vertices and an array with the missing vertices
	 */
	merge(vertices: Vertex[]): [merged: boolean, missing: string[]] {
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
					const drp = this._computeDRP(
						vertex.dependencies,
						preComputeLca,
						vertex.operation.drpType === DrpType.DRP ? vertex.operation : undefined
					);
					this._setDRPState(vertex, preComputeLca, this._getDRPState(drp));
				}

				const acl = this._computeObjectACL(
					vertex.dependencies,
					preComputeLca,
					vertex.operation.drpType === DrpType.ACL ? vertex.operation : undefined
				);
				this._setObjectACLState(vertex, preComputeLca, this._getDRPState(acl));

				this.hashGraph.addVertex(vertex);
				this._initializeFinalityState(vertex.hash, acl);
				newVertices.push(vertex);
			} catch (_) {
				missing.push(vertex.hash);
			}
		}

		this.vertices = this.hashGraph.getAllVertices();
		this._updateObjectACLState();
		if (this.drp) this._updateDRPState();
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
	private _applyOperation(drp: IDRP, operation: Operation): void {
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
	): IDRP {
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

		for (const vertex of linearizedVertices) {
			if (vertex.operation?.drpType === DrpType.DRP) {
				this._applyOperation(drp, vertex.operation);
			}
		}
		if (vertexOperation && vertexOperation.drpType === DrpType.DRP) {
			this._applyOperation(drp, vertexOperation);
		}

		return drp;
	}

	private _computeObjectACL(
		vertexDependencies: Hash[],
		preCompute?: LowestCommonAncestorResult,
		vertexOperation?: Operation
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
		for (const vertex of linearizedVertices) {
			if (vertex.operation?.drpType === DrpType.ACL) {
				this._applyOperation(acl, vertex.operation);
			}
		}
		if (vertexOperation && vertexOperation.drpType === DrpType.ACL) {
			this._applyOperation(acl, vertexOperation);
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
	): DRPState {
		const drp = this._computeDRP(vertexDependencies, preCompute, vertexOperation);
		return this._getDRPState(drp);
	}

	private _computeObjectACLState(
		vertexDependencies: Hash[],
		preCompute?: LowestCommonAncestorResult,
		vertexOperation?: Operation
	): DRPState {
		const acl = this._computeObjectACL(vertexDependencies, preCompute, vertexOperation);
		return this._getDRPState(acl);
	}

	private _setObjectACLState(
		vertex: Vertex,
		preCompute?: LowestCommonAncestorResult,
		drpState?: DRPState
	): void {
		if (this.acl) {
			this.aclStates.set(
				vertex.hash,
				drpState ?? this._computeObjectACLState(vertex.dependencies, preCompute, vertex.operation)
			);
		}
	}

	private _setDRPState(
		vertex: Vertex,
		preCompute?: LowestCommonAncestorResult,
		drpState?: DRPState
	): void {
		this.drpStates.set(
			vertex.hash,
			drpState ?? this._computeDRPState(vertex.dependencies, preCompute, vertex.operation)
		);
	}

	// update the DRP's attributes based on all the vertices in the hashgraph
	private _updateDRPState(): void {
		if (!this.drp || !this.hashGraph) {
			throw new Error("DRP or hashgraph is undefined");
		}
		const currentDRP = this.drp as IDRP;
		const newState = this._computeDRPState(this.hashGraph.getFrontier());
		for (const entry of newState.state) {
			if (entry.key in currentDRP && typeof currentDRP[entry.key] !== "function") {
				currentDRP[entry.key] = entry.value;
			}
		}
	}

	private _updateObjectACLState(): void {
		if (!this.acl || !this.hashGraph) {
			throw new Error("ObjectACL or hashgraph is undefined");
		}
		const currentObjectACL = this.acl as IACL;
		const newState = this._computeObjectACLState(this.hashGraph.getFrontier());
		for (const entry of newState.state) {
			if (entry.key in currentObjectACL && typeof currentObjectACL[entry.key] !== "function") {
				currentObjectACL[entry.key] = entry.value;
			}
		}
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
