/**
 * A deferred object is a promise that can be resolved or rejected.
 * @template {unknown} T - The type of the value the promise will resolve to
 */
export class Deferred<T> {
	promise: Promise<T>;
	resolve!: (value: T | PromiseLike<T>) => void;
	reject!: (reason?: unknown) => void;

	/**
	 * Creates a new deferred object
	 */
	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}
