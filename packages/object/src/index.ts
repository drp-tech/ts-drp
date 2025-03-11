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
	type LcaAndOperations,
	type LoggerOptions,
	type Operation,
	type Vertex,
} from "@ts-drp/types";
import { isPromise } from "@ts-drp/utils";
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

	private callFn(
		fn: string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		args: any,
		drpType: DrpType
	): unknown | Promise<unknown> {
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

		const handlePreoperationResult = (preOperationDRP: IDRP | IACL): unknown | Promise<unknown> => {
			const clonedDRP = cloneDeep(preOperationDRP);
			let result: unknown | Promise<unknown> = undefined;
			try {
				result = this._applyOperation(clonedDRP, vertexOperation);
			} catch (e) {
				log.error(`::drpObject::callFn: ${e}`);
				return result;
			}

			const handleResult = (result: unknown | Promise<unknown>): unknown | Promise<unknown> => {
				const stateChanged = Object.keys(preOperationDRP).some(
					(key) => !deepEqual(preOperationDRP[key], clonedDRP[key])
				);
				if (!stateChanged) {
					return result;
				}

				const [drpMaybePromise, aclMaybePromise] = isACL
					? [this._computeDRP(vertexDependencies, preComputeLca), clonedDRP as IACL]
					: [clonedDRP as IDRP, this._computeObjectACL(vertexDependencies, preComputeLca)];

				const handleFinaliseState = (drp: IDRP, acl: IACL): unknown | Promise<unknown> => {
					const vertex = this.hashGraph.createVertex(vertexOperation, vertexDependencies, now);

					this.hashGraph.addVertex(vertex);
					const setDRPStateResult = this._setDRPState(
						vertex,
						preComputeLca,
						this._getDRPState(drp)
					);
					const setObjectACLStateResult = this._setObjectACLState(
						vertex,
						preComputeLca,
						this._getDRPState(acl)
					);
					this._initializeFinalityState(vertex.hash, acl);

					this.vertices.push(vertex);
					this._notify("callFn", [vertex]);

					if (!isACL) Object.assign(this.drp as IDRP, clonedDRP);
					else Object.assign(this.acl as ObjectACL, clonedDRP);

					if (isPromise(setDRPStateResult) || isPromise(setObjectACLStateResult)) {
						return Promise.all([setDRPStateResult, setObjectACLStateResult]).then(() => result);
					}

					return result;
				};

				if (isPromise(drpMaybePromise) || isPromise(aclMaybePromise)) {
					return Promise.all([drpMaybePromise, aclMaybePromise]).then(([drp, acl]) =>
						handleFinaliseState(drp, acl)
					);
				}

				return handleFinaliseState(drpMaybePromise, aclMaybePromise);
			};

			return isPromise(result) ? result.then(handleResult) : handleResult(result);
		};

		return isPromise(preOperationDRP)
			? preOperationDRP.then((result) => {
					console.log("computePreOperationDRP promise", result);
					return handlePreoperationResult(result);
				})
			: handlePreoperationResult(preOperationDRP);
		//return appliedOperationResult;
	}

	//private callFn(
	//	fn: string,
	//	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	//	args: any,
	//	drpType: DrpType
	//): unknown | Promise<unknown> {
	//	if (!this.hashGraph) {
	//		throw new Error("Hashgraph is undefined");
	//	}

	//	const isACL = drpType === DrpType.ACL;
	//	const vertexDependencies = this.hashGraph.getFrontier();
	//	const vertexOperation = { drpType, opType: fn, value: args };
	//	const preComputeLca = this.computeLCA(vertexDependencies);
	//	const now = Date.now();

	//	const computePreOperationDRP = isACL
	//		? this._computeObjectACL(vertexDependencies)
	//		: this._computeDRP(vertexDependencies);

	//	const handleResult = (preOperationDRP: IDRP | IACL): unknown | Promise<unknown> => {
	//		console.log("preOperationDRP", preOperationDRP, fn);

	//		const clonedDRP = cloneDeep(preOperationDRP);
	//		let appliedOperationResult;
	//		try {
	//			appliedOperationResult = this._applyOperation(clonedDRP, vertexOperation);
	//		} catch (e) {
	//			log.error(`::drpObject::callFn: ${e}`);
	//			return appliedOperationResult;
	//		}

	//		const stateChanged = Object.keys(preOperationDRP).some(
	//			(key) => !deepEqual(preOperationDRP[key], clonedDRP[key])
	//		);
	//		console.log("stateChanged", stateChanged, appliedOperationResult);

	//		if (!stateChanged) {
	//			return appliedOperationResult;
	//		}

	//		const drpResult = isACL
	//			? this._computeDRP(vertexDependencies, preComputeLca)
	//			: (clonedDRP as IDRP);

	//		const aclResult = isACL
	//			? (clonedDRP as IACL)
	//			: this._computeObjectACL(vertexDependencies, preComputeLca);

	//		const finalizeVertex = (resolvedDRP: IDRP, resolvedACL: IACL): unknown | Promise<unknown> => {
	//			const vertex = this.hashGraph.createVertex(vertexOperation, vertexDependencies, now);

	//			this.hashGraph.addVertex(vertex);

	//			const ret = this._setDRPState(vertex, preComputeLca, this._getDRPState(resolvedDRP));
	//			const ret2 = this._setObjectACLState(vertex, preComputeLca, this._getDRPState(resolvedACL));

	//			const assign = (): unknown | Promise<unknown> => {
	//				this._initializeFinalityState(vertex.hash, resolvedACL);

	//				this.vertices.push(vertex);
	//				this._notify("callFn", [vertex]);

	//				if (!isACL) Object.assign(this.drp as IDRP, clonedDRP);
	//				else Object.assign(this.acl as ObjectACL, clonedDRP);

	//				return appliedOperationResult;
	//			};

	//			if (isPromise(ret) || isPromise(ret2)) {
	//				return Promise.all([ret, ret2]).then(assign);
	//			}
	//			return assign();
	//		};

	//		const drpPromise = isPromise(drpResult);
	//		const aclPromise = isPromise(aclResult);

	//		if (drpPromise || aclPromise) {
	//			return Promise.all([Promise.resolve(drpResult), Promise.resolve(aclResult)]).then(
	//				([resolvedDRP, resolvedACL]) => finalizeVertex(resolvedDRP, resolvedACL)
	//			);
	//		}

	//		return finalizeVertex(drpResult as IDRP, aclResult as IACL);
	//	};

	//	return isPromise(computePreOperationDRP)
	//		? computePreOperationDRP.then((result) => {
	//				console.log("computePreOperationDRP promise", result);
	//				return handleResult(result);
	//			})
	//		: handleResult(computePreOperationDRP);
	//}

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
		if (!this._checkWriterPermission(vertex.peerId, vertex.dependencies)) {
			throw new Error(`Vertex ${vertex.peerId} does not have write permission.`);
		}
	}

	async merge(vertices: Vertex[]): Promise<[merged: boolean, missing: string[]]> {
		if (!this.hashGraph) {
			throw new Error("Hashgraph is undefined");
		}

		const missing: Hash[] = [];
		const newVertices: Vertex[] = [];
		console.log("merging1", vertices.length);
		for (const vertex of vertices) {
			// Check to avoid manually crafted `undefined` operations
			if (!vertex.operation || this.hashGraph.vertices.has(vertex.hash)) {
				console.log("skipping", vertex.hash);
				continue;
			}

			try {
				this.validateVertex(vertex);
				const preComputeLca = this.computeLCA(vertex.dependencies);

				if (this.drp) {
					console.log("computing drp", vertex.dependencies, preComputeLca, vertex.operation);
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
		console.log("merged", [missing.length === 0, missing]);

		return [missing.length === 0, missing];
	}

	/* Merges the vertices into the hashgraph
	 * Returns a tuple with a boolean indicating if there were
	 * missing vertices and an array with the missing vertices
	 */
	//merge(vertices: Vertex[]): MergeResult | PromiseLike<MergeResult> {
	//	if (!this.hashGraph) {
	//		throw new Error("Hashgraph is undefined");
	//	}

	//	const missing: Hash[] = [];
	//	const newVertices: Vertex[] = [];

	//	// Process all vertices - but collect promises for later execution
	//	const vertexPromises: Array<{
	//		vertex: Vertex;
	//		promise: Promise<void>;
	//	}> = [];

	//	for (const vertex of vertices) {
	//		// Check to avoid manually crafted `undefined` operations
	//		if (!vertex.operation || this.hashGraph.vertices.has(vertex.hash)) {
	//			continue;
	//		}

	//		try {
	//			this.validateVertex(vertex);
	//			const preComputeLca = this.computeLCA(vertex.dependencies);

	//			let processPromise = Promise.resolve();

	//			// Handle DRP processing
	//			if (this.drp) {
	//				const drpResult = this._computeDRP(
	//					vertex.dependencies,
	//					preComputeLca,
	//					vertex.operation.drpType === DrpType.DRP ? vertex.operation : undefined
	//				);

	//				processPromise = processPromise.then(async () => {
	//					const drpPromise = isPromise(drpResult) ? drpResult : Promise.resolve(drpResult);

	//					const drp = await drpPromise;
	//					const drpState = this._getDRPState(drp);
	//					const setResult = this._setDRPState(vertex, preComputeLca, drpState);
	//					return isPromise(setResult) ? setResult : Promise.resolve();
	//				});
	//			}

	//			// Handle ACL processing
	//			const aclResult = this._computeObjectACL(
	//				vertex.dependencies,
	//				preComputeLca,
	//				vertex.operation.drpType === DrpType.ACL ? vertex.operation : undefined
	//			);

	//			processPromise = processPromise.then(async () => {
	//				const aclPromise = isPromise(aclResult) ? aclResult : Promise.resolve(aclResult);

	//				const acl = await aclPromise;
	//				const aclState = this._getDRPState(acl);
	//				const setResult = this._setObjectACLState(vertex, preComputeLca, aclState);
	//				const finalPromise = isPromise(setResult) ? setResult : Promise.resolve();
	//				await finalPromise;
	//				this._initializeFinalityState(vertex.hash, acl);
	//			});

	//			// Save this vertex's processing promise
	//			vertexPromises.push({
	//				vertex,
	//				promise: processPromise,
	//			});
	//		} catch (_) {
	//			missing.push(vertex.hash);
	//		}
	//	}

	//	// Schedule asynchronous processing of all vertices
	//	// We'll process them in sequence to maintain the same order
	//	let sequentialProcessing = Promise.resolve();

	//	vertexPromises.forEach(({ vertex, promise }) => {
	//		sequentialProcessing = sequentialProcessing
	//			.then(() => promise)
	//			.then(() => {
	//				this.hashGraph.addVertex(vertex);
	//				newVertices.push(vertex);
	//			})
	//			.catch(() => {
	//				missing.push(vertex.hash);
	//			});
	//	});

	//	// Schedule the final updates after all vertices are processed
	//	sequentialProcessing = sequentialProcessing
	//		.then(() => {
	//			this.vertices = this.hashGraph.getAllVertices();

	//			const updateACL = this._updateObjectACLState();
	//			return isPromise(updateACL) ? updateACL : Promise.resolve();
	//		})
	//		.then(() => {
	//			if (this.drp) {
	//				const updateDRP = this._updateDRPState();
	//				return isPromise(updateDRP) ? updateDRP : Promise.resolve();
	//			}
	//		})
	//		.catch((error) => {
	//			console.error("Error in pending operations after merge:", error);
	//		})
	//		.finally(() => {
	//			this._notify("merge", newVertices);
	//		});

	//	// Start the processing chain without waiting for it
	//	sequentialProcessing.catch((error) => {
	//		console.error("Error processing vertices:", error);
	//	});
	//	// Return immediately
	//	return [missing.length === 0, missing];
	//}
	/* Merges the vertices into the hashgraph
	 * Returns a tuple with a boolean indicating if there were
	 * missing vertices and an array with the missing vertices
	 */
	//merge(vertices: Vertex[]): MergeResult | Promise<MergeResult> {
	//	if (!this.hashGraph) {
	//		throw new Error("Hashgraph is undefined");
	//	}

	//	const missing: Hash[] = [];
	//	const newVertices: Vertex[] = [];
	//	const promises: Promise<void>[] = [];

	//	for (const vertex of vertices) {
	//		// Check to avoid manually crafted `undefined` operations
	//		if (!vertex.operation || this.hashGraph.vertices.has(vertex.hash)) {
	//			continue;
	//		}

	//		try {
	//			this.validateVertex(vertex);
	//			const preComputeLca = this.computeLCA(vertex.dependencies);

	//			// Handle DRP computation if DRP is enabled
	//			if (this.drp) {
	//				const drpResult = this._computeDRP(
	//					vertex.dependencies,
	//					preComputeLca,
	//					vertex.operation.drpType === DrpType.DRP ? vertex.operation : undefined
	//				);

	//				// Handle potential Promise return from _computeDRP
	//				if (drpResult instanceof Promise) {
	//					const drpPromise = drpResult.then((drp) => {
	//						const drpState = this._getDRPState(drp);
	//						const setResult = this._setDRPState(vertex, preComputeLca, drpState);
	//						if (setResult instanceof Promise) return setResult;
	//					});
	//					promises.push(drpPromise);
	//				} else {
	//					const drpState = this._getDRPState(drpResult);
	//					const setResult = this._setDRPState(vertex, preComputeLca, drpState);
	//					if (setResult instanceof Promise) {
	//						promises.push(setResult);
	//					}
	//				}
	//			}

	//			// Handle ACL computation
	//			const aclResult = this._computeObjectACL(
	//				vertex.dependencies,
	//				preComputeLca,
	//				vertex.operation.drpType === DrpType.ACL ? vertex.operation : undefined
	//			);

	//			// Handle potential Promise return from _computeObjectACL
	//			if (aclResult instanceof Promise) {
	//				const aclPromise = aclResult.then((acl) => {
	//					const aclState = this._getDRPState(acl);
	//					const setResult = this._setObjectACLState(vertex, preComputeLca, aclState);
	//					if (setResult instanceof Promise) return setResult;
	//					this._initializeFinalityState(vertex.hash, acl);
	//				});
	//				promises.push(aclPromise);
	//			} else {
	//				const aclState = this._getDRPState(aclResult);
	//				const setResult = this._setObjectACLState(vertex, preComputeLca, aclState);
	//				if (setResult instanceof Promise) {
	//					promises.push(
	//						setResult.then(() => {
	//							this._initializeFinalityState(vertex.hash, aclResult);
	//						})
	//					);
	//				} else {
	//					this._initializeFinalityState(vertex.hash, aclResult);
	//				}
	//			}

	//			this.hashGraph.addVertex(vertex);
	//			newVertices.push(vertex);
	//		} catch (_) {
	//			missing.push(vertex.hash);
	//		}
	//	}

	//	this.vertices = this.hashGraph.getAllVertices();

	//	// Handle updates to state
	//	const updateAclResult = this._updateObjectACLState();
	//	if (updateAclResult instanceof Promise) {
	//		promises.push(updateAclResult);
	//	}

	//	if (this.drp) {
	//		const updateDrpResult = this._updateDRPState();
	//		if (updateDrpResult instanceof Promise) {
	//			promises.push(updateDrpResult);
	//		}
	//	}

	//	this._notify("merge", newVertices);

	//	// If we have any promises, return a Promise that resolves when all are done
	//	if (promises.length > 0) {
	//		return Promise.all(promises).then(() => [missing.length === 0, missing]);
	//	}

	//	// Otherwise return synchronously
	//	return [missing.length === 0, missing];
	//}

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
			const result = target[methodName](...value);
			console.trace("result", result, methodName);
			return result;
		} catch (e) {
			throw new Error(`Error while applying operation ${opType}: ${e}`);
		}
	}

	// compute the DRP based on all dependencies of the current vertex using partial linearization
	private _computeDRP(
		vertexDependencies: Hash[],
		preCompute?: LcaAndOperations,
		vertexOperation?: Operation
	): IDRP | Promise<IDRP> {
		if (!this.drp || !this.originalDRP) {
			throw new Error("DRP is undefined");
		}

		const { lca, linearizedOperations } = preCompute ?? this.computeLCA(vertexDependencies);

		const drp = cloneDeep(this.originalDRP);

		const fetchedState = this.drpStates.get(lca);
		if (!fetchedState) {
			throw new Error("State is undefined");
		}

		const state = cloneDeep(fetchedState);

		for (const entry of state.state) {
			drp[entry.key] = entry.value;
		}
		console.log("linearizedOperations", linearizedOperations.length);
		const operations = linearizedOperations.filter((op) => op.drpType === DrpType.DRP);
		if (vertexOperation && vertexOperation.drpType === DrpType.DRP) {
			operations.push(vertexOperation);
		}
		console.log("operations", operations.length);
		const asyncOps = operations.map((op) => this._applyOperation(drp, op));
		console.log("asyncOps", asyncOps);
		const hasAsync = asyncOps.some(isPromise);

		if (hasAsync) {
			console.log("hasAsync", asyncOps);
			return Promise.all(asyncOps).then(() => drp);
		}

		return drp;
	}

	private _computeObjectACL(
		vertexDependencies: Hash[],
		preCompute?: LcaAndOperations,
		vertexOperation?: Operation
	): IACL | Promise<IACL> {
		if (!this.acl || !this.originalObjectACL) {
			throw new Error("ObjectACL is undefined");
		}

		const { lca, linearizedOperations } = preCompute ?? this.computeLCA(vertexDependencies);

		const acl = cloneDeep(this.originalObjectACL);

		const fetchedState = this.aclStates.get(lca);
		if (!fetchedState) {
			throw new Error("State is undefined");
		}

		const state = cloneDeep(fetchedState);

		for (const entry of state.state) {
			acl[entry.key] = entry.value;
		}

		const operations = linearizedOperations.filter((op) => op.drpType === DrpType.ACL);
		if (vertexOperation && vertexOperation.drpType === DrpType.ACL) {
			operations.push(vertexOperation);
		}

		const asyncOps = operations.map((op) => this._applyOperation(acl, op));
		const hasAsync = asyncOps.some(isPromise);

		if (hasAsync) {
			return Promise.all(asyncOps).then(() => acl);
		}

		return acl;
	}

	private computeLCA(vertexDependencies: string[]): LcaAndOperations {
		if (!this.hashGraph) {
			throw new Error("Hashgraph is undefined");
		}

		const subgraph: ObjectSet<Hash> = new ObjectSet();
		const lca =
			vertexDependencies.length === 1
				? vertexDependencies[0]
				: this.hashGraph.lowestCommonAncestorMultipleVertices(vertexDependencies, subgraph);
		const linearizedOperations =
			vertexDependencies.length === 1 ? [] : this.hashGraph.linearizeOperations(lca, subgraph);
		return { lca, linearizedOperations };
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
		preCompute?: LcaAndOperations,
		vertexOperation?: Operation
	): DRPState | Promise<DRPState> {
		const drp = this._computeDRP(vertexDependencies, preCompute, vertexOperation);
		return isPromise(drp) ? drp.then(this._getDRPState) : this._getDRPState(drp);
	}

	private _computeObjectACLState(
		vertexDependencies: Hash[],
		preCompute?: LcaAndOperations,
		vertexOperation?: Operation
	): DRPState | Promise<DRPState> {
		const acl = this._computeObjectACL(vertexDependencies, preCompute, vertexOperation);
		return isPromise(acl) ? acl.then(this._getDRPState) : this._getDRPState(acl);
	}

	private _setObjectACLState(
		vertex: Vertex,
		preCompute?: LcaAndOperations,
		drpState?: DRPState
	): void | Promise<void> {
		if (this.acl) {
			const stateComputation =
				drpState ?? this._computeObjectACLState(vertex.dependencies, preCompute, vertex.operation);

			if (isPromise(stateComputation)) {
				return stateComputation.then((state): void => {
					this.aclStates.set(vertex.hash, state);
				});
			}
			this.aclStates.set(vertex.hash, stateComputation);
		}
	}

	private _setDRPState(
		vertex: Vertex,
		preCompute?: LcaAndOperations,
		drpState?: DRPState
	): void | Promise<void> {
		const stateComputation =
			drpState ?? this._computeDRPState(vertex.dependencies, preCompute, vertex.operation);

		if (isPromise(stateComputation)) {
			return stateComputation.then((state): void => {
				this.drpStates.set(vertex.hash, state);
			});
		}
		this.drpStates.set(vertex.hash, stateComputation);
	}

	// update the DRP's attributes based on all the vertices in the hashgraph
	private _updateDRPState(): void | Promise<void> {
		if (!this.drp || !this.hashGraph) {
			throw new Error("DRP or hashgraph is undefined");
		}
		const currentDRP = this.drp as IDRP;
		const newState = this._computeDRPState(this.hashGraph.getFrontier());
		if (isPromise(newState)) {
			return newState.then((state): void => {
				for (const entry of state.state) {
					if (entry.key in currentDRP && typeof currentDRP[entry.key] !== "function") {
						currentDRP[entry.key] = entry.value;
					}
				}
			});
		}
		for (const entry of newState.state) {
			if (entry.key in currentDRP && typeof currentDRP[entry.key] !== "function") {
				currentDRP[entry.key] = entry.value;
			}
		}
	}

	private _updateObjectACLState(): void | Promise<void> {
		if (!this.acl || !this.hashGraph) {
			throw new Error("ObjectACL or hashgraph is undefined");
		}
		const currentObjectACL = this.acl as IACL;
		const newState = this._computeObjectACLState(this.hashGraph.getFrontier());
		if (isPromise(newState)) {
			return newState.then((state): void => {
				for (const entry of state.state) {
					if (entry.key in currentObjectACL && typeof currentObjectACL[entry.key] !== "function") {
						currentObjectACL[entry.key] = entry.value;
					}
				}
			});
		}
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
