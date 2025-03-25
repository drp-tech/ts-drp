import { handlePromiseOrValue } from "@ts-drp/utils";

import { type StopableChain } from "./chainable.js";

export interface DRPProxyBeforeChainArgs {
	prop: string;
	args: unknown[];
}

export class DRPProxy<T extends object, BeforeChainOutput = unknown> {
	private beforeChain: StopableChain<DRPProxyBeforeChainArgs, BeforeChainOutput>;
	private afterChain: StopableChain<BeforeChainOutput, unknown>;

	private applyFn: (operation: BeforeChainOutput, methodName: string, args: unknown[]) => unknown;

	private target: T;
	private readonly _proxy: T;

	/**
	 * Creates a new DRPProxy instance
	 * @param target - The target object this proxy is associated with
	 */
	constructor(
		target: T,
		beforeChain: StopableChain<unknown, BeforeChainOutput>,
		afterChain: StopableChain<BeforeChainOutput, unknown>,
		applyFn: (operation: BeforeChainOutput, methodName: string, args: unknown[]) => unknown
	) {
		this.target = target;
		this.beforeChain = beforeChain;
		this.afterChain = afterChain;
		this.applyFn = applyFn;
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
