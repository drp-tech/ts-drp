interface ProxyCallbacks<T> {
	(target: T, ...args: unknown[]): void;
}

export class DRPProxy<T extends object> {
	private readonly target: T;
	private readonly beforeCallbacks: ProxyCallbacks<T>[] = [];
	private readonly afterCallbacks: ProxyCallbacks<T>[] = [];

	proxy: T;

	constructor(target: T) {
		this.target = target;
		this.proxy = this._proxy();
	}

	registerBeforeCall(callback: ProxyCallbacks<T>): void {
		this.beforeCallbacks.push(callback);
	}

	registerAfterCall(callback: ProxyCallbacks<T>): void {
		this.afterCallbacks.push(callback);
	}

	private _proxy(): T {
		const handler: ProxyHandler<T> = {
			get: (target, prop) => {
				const originalValue = target[prop as keyof T];
				if (typeof originalValue !== "function" || (typeof prop === "string" && prop.startsWith("query_"))) {
					return originalValue;
				}

				return (...args: unknown[]) => {
					for (const callback of this.beforeCallbacks) {
						callback(target, ...args);
					}

					const result = originalValue.apply(target, args);

					for (const callback of this.afterCallbacks) {
						callback(target, ...args, result);
					}

					return result;
				};
			},
		};

		return new Proxy(this.target, handler);
	}
}
