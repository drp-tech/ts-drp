import { type DrpType, type IACL, type IDRP, type LowestCommonAncestorResult, type Vertex } from "@ts-drp/types";
import { handlePromiseOrValue } from "@ts-drp/utils";

import { type StopableChain } from "./chainable.js";
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

export interface Operation2<T extends IDRP> extends PostSplitOperation {
	acl: IACL;
	drp?: T;

	/**
	 * the current state of the drp this is cloned from the drp if we are treating a drp operation
	 */
	currentDRP?: T | IACL;
}

export interface PostOperation2<T extends IDRP> extends Operation2<T> {
	result: unknown;
}

export class DRPProxy<T extends object, BeforeChainOutput = unknown> {
	private beforeChain: StopableChain<DRPProxyBeforeChainArgs, BeforeChainOutput>;
	private afterChain: StopableChain<BeforeChainOutput, unknown>;

	private applyFn: (operation: BeforeChainOutput, methodName: string, args: unknown[]) => unknown;

	private target: T;
	private readonly _proxy: T;
	private type: DrpType;

	/**
	 * Creates a new DRPProxy instance
	 * @param target - The target object this proxy is associated with
	 */
	constructor(
		target: T,
		beforeChain: StopableChain<unknown, BeforeChainOutput>,
		afterChain: StopableChain<BeforeChainOutput, unknown>,
		applyFn: (operation: BeforeChainOutput, methodName: string, args: unknown[]) => unknown,
		type: DrpType
	) {
		this.target = target;
		this.beforeChain = beforeChain;
		this.afterChain = afterChain;
		this.applyFn = applyFn;
		this.type = type;
		this._proxy = this.createProxy();
	}

	/**
	 * Create the proxy that intercepts method calls
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
					const beforeResult = this.beforeChain.execute({ prop, args });
					if (beforeResult === undefined) {
						throw new Error("Before chain returned undefined");
					}
					return handlePromiseOrValue(beforeResult, (resolvedBeforeResult) => {
						const result = this.applyFn(resolvedBeforeResult, prop, args);

						return handlePromiseOrValue(result, (resolvedResult) => {
							this.afterChain.execute(resolvedBeforeResult);

							return resolvedResult;
						});
					});
				};
			},
		};

		return new Proxy(this.target, handler);
	}

	get proxy(): T {
		return this._proxy;
	}
}
export class DRPProxy2<T extends IDRP> {
	private pipeline: Pipeline<DRPProxyChainArgs, PostOperation2<IDRP>>;

	private target: T;
	private readonly _proxy: T;
	private type: DrpType;

	/**
	 * Creates a new DRPProxy instance
	 * @param target - The target object this proxy is associated with
	 */
	constructor(target: T, pipeline: Pipeline<DRPProxyChainArgs, PostOperation2<IDRP>>, type: DrpType) {
		this.type = type;
		this.target = target;
		this.pipeline = pipeline;
		this._proxy = this.createProxy();
	}

	/**
	 * Create the proxy that intercepts method calls
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
					const operation = this.pipeline.handle({ prop, args, type: this.type });

					return handlePromiseOrValue(operation, (postOperation) => postOperation.result);
				};
			},
		};

		return new Proxy(this.target, handler);
	}

	get proxy(): T {
		return this._proxy;
	}
}
