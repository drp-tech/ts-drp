import { Logger } from "@ts-drp/logger";
import {
	type ApplyResult,
	DrpType,
	type FinalityConfig,
	type Hash,
	type IACL,
	type IDRP,
	type IHashGraph,
	type LoggerOptions,
	type Vertex,
} from "@ts-drp/types";
import { handlePromiseOrValue, processSequentially } from "@ts-drp/utils";
import { validateVertex } from "@ts-drp/validation";
import { cloneDeep } from "es-toolkit";
import { deepEqual } from "fast-equals";

import { createACL, type ObjectACLOptions } from "./acl/index.js";
import { FinalityStore } from "./finality/index.js";
import { HashGraph } from "./hashgraph/index.js";
import {
	type BaseOperation,
	type Operation,
	type PostLCAOperation,
	type PostOperation,
	type PostSplitOperation,
} from "./operation.js";
import { createPipeline, type Pipeline } from "./pipeline/pipeline.js";
import { type HandlerReturn } from "./pipeline/types.js";
import { DRPProxy, type DRPProxyChainArgs } from "./proxy.js";
import { DRPObjectStateManager, stateFromDRP } from "./state.js";

interface DRPVertexApplierBase<T extends IDRP> {
	drp?: T;
	acl: IACL;
	hg: IHashGraph;
	finalityStore: FinalityStore;
	states: DRPObjectStateManager<T>;
	logConfig?: LoggerOptions;
	finalityConfig?: FinalityConfig;
	notify(origin: string, vertices: Vertex[]): void;
}

interface DRPVertexApplierWithACL<T extends IDRP> extends Partial<DRPVertexApplierBase<T>> {
	acl: IACL;
	peerId?: string;
}

interface DRPVertexApplierWithACLOptions<T extends IDRP> extends Partial<DRPVertexApplierBase<T>> {
	aclOptions: ObjectACLOptions;
	peerId?: string;
}

type DRPVertexApplierOptions<T extends IDRP> = DRPVertexApplierWithACL<T> | DRPVertexApplierWithACLOptions<T>;

type PeerIdOnly<T extends IDRP> = (DRPVertexApplierWithACL<T> | DRPVertexApplierWithACLOptions<T>) & {
	peerId: string;
};

/**
 * Applies vertices to the hash graph
 * @template T - The type of the DRP object
 */
export class DRPVertexApplier<T extends IDRP> {
	protected readonly hashgraph: IHashGraph;
	protected readonly states: DRPObjectStateManager<T>;

	private _proxyDRP?: DRPProxy<T>;
	private _proxyACL: DRPProxy<IACL>;

	private applyVertexPipeline: Pipeline<BaseOperation, PostOperation<T>>;
	private finalityStore: FinalityStore;
	private _notify: (origin: string, vertices: Vertex[]) => void;
	private log: Logger;

	/**
	 * Creates a new DRPVertexApplier
	 * @param options - The options for the DRPVertexApplier
	 * @param options.drp - The DRP object
	 * @param options.acl - The ACL object
	 * @param options.hg - The hash graph
	 * @param options.states - The state manager for the DRP object. If not provided, a new one will be created.
	 * @param options.finalityStore - The finality store
	 * @param options.notify - The notify function
	 * @param options.logConfig - The log config
	 */
	constructor({ drp, acl, hg, states, finalityStore, notify, logConfig }: DRPVertexApplierBase<T>) {
		this.hashgraph = hg;
		this.states = states;
		this.finalityStore = finalityStore;
		this._notify = notify;
		this.log = new Logger("drp::object::operation", logConfig);

		const callFnPipeline = createPipeline(this.createVertex.bind(this)) // this is there but not in applies
			.setNext(this.validateVertex.bind(this))
			.setNext(this.getLCA.bind(this))
			.setNext(this.splitLCAOperation.bind(this))
			.setNext(this.computeOperation.bind(this))
			.setNext(this.validateWriterPermission.bind(this))
			.setNext(this.applyFn.bind(this))
			.setNext(this.equal.bind(this)) // in callFn but not in applyVertex
			.setNext(this.assign.bind(this))
			.setNext(this.assignState.bind(this))
			.setNext(this.addVertexToHashgraph.bind(this))
			.setNext(this.initializeFinalityStore.bind(this))
			.setNext(this.notify.bind(this)); // this is there but not in applies

		this.applyVertexPipeline = createPipeline(this.validateVertex.bind(this))
			.setNext(this.getLCA.bind(this))
			.setNext(this.splitLCAOperation.bind(this))
			.setNext(this.computeOperation.bind(this))
			.setNext(this.validateWriterPermission.bind(this))
			.setNext(this.applyFn.bind(this))
			.setNext(this.assignState.bind(this))
			.setNext(this.initializeFinalityStore.bind(this))
			.setNext(this.addVertexToHashgraph.bind(this));

		this._proxyACL = new DRPProxy(acl, callFnPipeline, DrpType.ACL);
		if (drp) {
			this._proxyDRP = new DRPProxy(drp, callFnPipeline, DrpType.DRP);
		}
	}

	/**
	 * Get the DRP object
	 * @returns The DRP object
	 */
	get drp(): T | undefined {
		return this._proxyDRP?.proxy;
	}

	/**
	 * Get the ACL object
	 * @returns The ACL object
	 */
	get acl(): IACL {
		return this._proxyACL.proxy;
	}

	/**
	 * Apply the vertices to the hash graph
	 * @param vertices - The vertices to apply
	 * @returns The result of the apply
	 */
	async applyVertices(vertices: Vertex[]): Promise<ApplyResult> {
		const missing: Hash[] = [];
		const newVertices: Vertex[] = [];

		for (const vertex of vertices) {
			if (!vertex.operation) {
				this.log.warn("Vertex has no operation", vertex);
				continue;
			}
			if (vertex.operation.opType === "-1") continue;
			if (this.hashgraph.vertices.has(vertex.hash)) {
				continue;
			}

			try {
				await this.applyVertexPipeline.execute({ vertex: vertex, isACL: vertex.operation.drpType === DrpType.ACL });
				newVertices.push(vertex);
			} catch (e) {
				this.log.error("Error applying vertex", e);
				missing.push(vertex.hash);
			}
		}

		const frontier = this.hashgraph.getFrontier();
		const lca = this.hashgraph.getLCA(frontier);
		const [drpVertices, aclVertices] = splitOperation(lca.linearizedVertices);

		const [drp, acl] = this.states.fromHash(lca.lca);
		await applyVertices(acl, aclVertices);
		Object.assign(this.acl, acl);
		if (drp && this.drp) {
			await applyVertices(drp, drpVertices);
			Object.assign(this.drp, drp);
		}

		this._notify("merge", newVertices);
		return { applied: missing.length === 0, missing };
	}

	private createVertex({ prop: opType, args: value, type: drpType }: DRPProxyChainArgs): HandlerReturn<BaseOperation> {
		return {
			stop: false,
			result: { vertex: this.hashgraph.createVertex({ drpType, opType, value }), isACL: drpType === DrpType.ACL },
		};
	}

	private validateVertex(operation: BaseOperation): HandlerReturn<BaseOperation> {
		const { vertex } = operation;
		const result = validateVertex(vertex, this.hashgraph, Date.now());
		if (result.error) {
			throw result.error;
		}
		return { stop: false, result: operation };
	}

	private getLCA(operation: BaseOperation): HandlerReturn<PostLCAOperation> {
		const { vertex } = operation;
		return { stop: false, result: { ...operation, lcaResult: this.hashgraph.getLCA(vertex.dependencies) } };
	}

	private splitLCAOperation(operation: PostLCAOperation): HandlerReturn<PostSplitOperation> {
		const {
			lcaResult: { linearizedVertices },
		} = operation;
		const [drp, acl] = splitOperation(linearizedVertices);
		return { stop: false, result: { ...operation, aclVertices: acl, drpVertices: drp } };
	}

	private computeOperation(
		operation: PostSplitOperation
	): HandlerReturn<Operation<T>> | Promise<HandlerReturn<Operation<T>>> {
		const {
			lcaResult: { lca },
			drpVertices,
			aclVertices,
			isACL,
		} = operation;
		const [drp, acl] = this.states.fromHash(lca);
		applyVertices(acl, aclVertices);

		if (!drp) {
			// we need to clone deep is the current op is ACL cause the state of this object could change
			return {
				stop: false,
				result: { ...operation, acl, currentDRP: isACL ? cloneDeep(acl) : undefined },
			};
		}

		const p = applyVertices(drp, drpVertices);
		return handlePromiseOrValue(p, () => {
			return {
				stop: false,
				result: {
					...operation,
					drp,
					acl,
					currentDRP: isACL ? cloneDeep(acl) : cloneDeep(drp),
				},
			};
		});
	}

	private validateWriterPermission(operation: Operation<T>): HandlerReturn<Operation<T>> {
		const {
			acl,
			vertex: { peerId },
			isACL,
		} = operation;
		if (isACL) return { stop: false, result: operation };

		const isWriter = acl.query_isWriter(peerId);
		if (!isWriter) throw new Error("Not a writer " + peerId);
		return { stop: false, result: operation };
	}

	private applyFn(
		drpOperation: Operation<T>
	): HandlerReturn<PostOperation<T>> | Promise<HandlerReturn<PostOperation<T>>> {
		const {
			currentDRP,
			vertex: { peerId, operation },
			isACL,
		} = drpOperation;

		if (!operation) throw new Error("Operation is undefined");

		const { opType, value } = operation;

		if (!currentDRP) return { stop: false, result: { ...drpOperation, result: undefined } };

		if (isACL) {
			// ACL does not have async functions
			return {
				stop: false,
				result: { ...drpOperation, result: callDRP(currentDRP, peerId, opType, value) },
			};
		}

		return handlePromiseOrValue(
			callDRP(currentDRP, peerId, opType, value),
			(result): HandlerReturn<PostOperation<T>> => ({ stop: false, result: { ...drpOperation, result } })
		);
	}

	private equal(operation: PostOperation<T>): HandlerReturn<PostOperation<T>> {
		const { acl, drp, currentDRP, isACL } = operation;
		const oldDRP = isACL ? acl : drp;

		if (currentDRP === undefined || oldDRP === undefined) return { stop: false, result: operation };

		const changed = Object.keys(oldDRP).some((key) => {
			if (key === "context") return false;

			return !deepEqual(oldDRP[key], currentDRP[key]);
		});

		return { stop: !changed, result: operation };
	}

	private assign<Op extends Operation<T>>(operation: Op): HandlerReturn<Op> {
		const { isACL, currentDRP } = operation;
		if (!isACL && this._proxyDRP) {
			Object.assign(this._proxyDRP.proxy, currentDRP);
			return { stop: false, result: operation };
		}
		Object.assign(this._proxyACL.proxy, currentDRP);
		return { stop: false, result: operation };
	}

	private assignState<Op extends Operation<T>>(operation: Op): HandlerReturn<Op> {
		const {
			isACL,
			currentDRP,
			acl,
			drp,
			vertex: { hash },
		} = operation;

		const [aclState, drpState] = isACL
			? [stateFromDRP(currentDRP), stateFromDRP(drp)]
			: [stateFromDRP(acl), stateFromDRP(currentDRP)];

		this.states.setACLState(hash, aclState);
		this.states.setDRPState(hash, drpState);
		return { stop: false, result: operation };
	}

	private addVertexToHashgraph<Op extends Operation<T>>(operation: Op): HandlerReturn<Op> {
		const { vertex } = operation;
		this.hashgraph.addVertex(vertex);
		return { stop: false, result: operation };
	}

	private initializeFinalityStore<Op extends Operation<T>>(operation: Op): HandlerReturn<Op> {
		const { vertex, acl } = operation;
		this.finalityStore.initializeState(vertex.hash, acl.query_getFinalitySigners());
		return { stop: false, result: operation };
	}

	private notify(operation: PostOperation<T>): HandlerReturn<PostOperation<T>> {
		this._notify("callFn", [operation.vertex]);
		return { stop: false, result: operation };
	}
}

/**
 * Creates a DRPVertexApplier
 * @param options - The options for the DRPVertexApplier
 * @returns The DRPVertexApplier
 */
export function createDRPVertexApplier<T extends IDRP>(
	options: DRPVertexApplierOptions<T>
): [DRPVertexApplier<T>, DRPObjectStateManager<T>, IHashGraph] {
	const acl = hasAcl(options) ? options.acl : createACL(options.aclOptions);
	const states = options.states ?? new DRPObjectStateManager(acl, options.drp);
	const finalityStore = options.finalityStore ?? new FinalityStore(options.finalityConfig, options.logConfig);

	const hashgraph = hasPeerIdAndNoHG(options)
		? new HashGraph(
				options.peerId,
				acl.resolveConflicts?.bind(acl),
				options.drp?.resolveConflicts?.bind(options.drp),
				options.drp?.semanticsType
			)
		: options.hg;

	if (hashgraph === undefined) throw new Error("hg and peerId are undefined");

	const obj = new DRPVertexApplier({
		...options,
		hg: hashgraph,
		acl,
		states,
		finalityStore,
		notify: options.notify ?? ((): void => {}),
	});

	return [obj, states, hashgraph];
}

function hasAcl<T extends IDRP>(options: DRPVertexApplierOptions<T>): options is DRPVertexApplierWithACL<T> {
	return "acl" in options;
}

function hasPeerIdAndNoHG<T extends IDRP>(options: DRPVertexApplierOptions<T>): options is PeerIdOnly<T> {
	return options.peerId !== undefined && options.hg === undefined && options.peerId !== "";
}

function callDRP<T extends IDRP>(drp: T, caller: string, method: string, args: unknown[]): unknown | Promise<unknown> {
	if (drp.context) drp.context.caller = caller;

	return drp[method](...args);
}

function applyVertex<T extends IDRP>(drp: T, vertex: Vertex): unknown | Promise<unknown> {
	const { operation, peerId } = vertex;
	if (!operation) throw new Error("Operation is undefined");

	return callDRP(drp, peerId, operation.opType, operation.value);
}

function applyVertices<T extends IDRP>(drp: T, vertices: Vertex[]): unknown | Promise<unknown> {
	return processSequentially(vertices, (drp, v) => applyVertex(drp, v), drp);
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
