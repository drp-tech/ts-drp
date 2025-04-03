import { type DrpType, type IACL, type IDRP, type LowestCommonAncestorResult, type Vertex } from "@ts-drp/types";
import { handlePromiseOrValue } from "@ts-drp/utils";

import { type Pipeline } from "../pipeline/pipeline.js";

export interface DRPProxyBeforeChainArgs {
	prop: string;
	args: unknown[];
}

export interface DRPProxyChainArgs {
	prop: string;
	args: unknown[];
	type: DrpType;
}

export interface BaseOperation {
	/**
	 * the type of the operation
	 */
	isACL: boolean;

	/**
	 * the vertex that is being applied
	 */
	vertex: Vertex;
}

export interface PostLCAOperation extends BaseOperation {
	/**
	 * the lca of the vertex
	 */
	lca: LowestCommonAncestorResult;
}

export interface PostSplitOperation extends PostLCAOperation {
	drpVertices: Vertex[];
	aclVertices: Vertex[];
}

export interface Operation<T extends IDRP> extends PostSplitOperation {
	acl: IACL;
	drp?: T;

	/**
	 * the current state of the drp this is cloned from the drp if we are treating a drp operation
	 */
	currentDRP?: T | IACL;
}

export interface PostOperation<T extends IDRP> extends Operation<T> {
	result: unknown;
}

/**
 * A proxy for a DRP object
 * @template T - The type of the DRP object
 */
export class DRPProxy<T extends IDRP> {
	private pipeline: Pipeline<DRPProxyChainArgs, PostOperation<IDRP>>;

	private target: T;
	private readonly _proxy: T;
	private type: DrpType;

	/**
	 * Creates a new DRPProxy instance
	 * @param target - The target object this proxy is associated with
	 * @param pipeline - The pipeline of steps to be executed
	 * @param type - The type of the proxy
	 */
	constructor(target: T, pipeline: Pipeline<DRPProxyChainArgs, PostOperation<IDRP>>, type: DrpType) {
		this.type = type;
		this.target = target;
		this.pipeline = pipeline;
		this._proxy = this.createProxy();
	}

	/**
	 * Create the proxy that intercepts method calls
	 * @returns The proxy
	 */
	createProxy(): T {
		const handler: ProxyHandler<T> = {
			get: (target, prop) => {
				const propKey = prop as keyof T;
				const originalValue = target[propKey];

				// Only intercept function calls
				if (typeof originalValue !== "function" || typeof prop !== "string") {
					return originalValue;
				}

				// Skip proxy behavior for specific methods
				if (prop.startsWith("query_") || prop === "resolveConflicts") {
					return originalValue;
				}

				// Return wrapped function
				return (...args: unknown[]) => {
					const operation = this.pipeline.execute({ prop, args, type: this.type });

					return handlePromiseOrValue(operation, (postOperation) => postOperation.result);
				};
			},
		};

		return new Proxy(this.target, handler);
	}

	/**
	 * Get the proxy
	 * @returns The proxy
	 */
	get proxy(): T {
		return this._proxy;
	}
}
