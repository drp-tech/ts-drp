/**
 * Checks if a value is a Promise.
 *
 * @template T - The type of value that the Promise resolves to
 * @param {unknown} obj - The value to check
 * @returns {boolean} True if the value is a Promise, false otherwise
 *
 * @example
 * ```ts
 * isPromise(Promise.resolve(42)) // returns true
 * isPromise(new Promise(resolve => resolve())) // returns true
 * isPromise(42) // returns false
 * isPromise({ then: 123 }) // returns false - must have a function 'then'
 * ```
 */
export function isPromise<T>(obj: unknown): obj is Promise<T> {
	return typeof (obj as { then?: unknown })?.then === "function";
}

/**
 * Checks if a value is a Generator object.
 * Note: This checks for Generator instances, not generator functions.
 *
 * @param {unknown} obj - The value to check
 * @returns {boolean} True if the value is a Generator, false otherwise
 *
 * @example
 * ```ts
 * function* gen() { yield 1; }
 * isGenerator(gen()) // returns true - gen() creates a generator
 * isGenerator(gen) // returns false - gen is a generator function
 * isGenerator([1,2,3]) // returns false
 * ```
 */
export function isGenerator(obj: unknown): obj is Generator {
	if (!obj) return false;
	const iterator = (obj as { [Symbol.iterator]?: unknown })?.[Symbol.iterator];
	if (typeof iterator !== "function") return false;

	const instance = obj as { next?: unknown };
	return typeof instance.next === "function";
}

/**
 * Checks if a value is an AsyncGenerator object.
 * Note: This checks for AsyncGenerator instances, not async generator functions.
 *
 * @param {unknown} obj - The value to check
 * @returns {boolean} True if the value is an AsyncGenerator, false otherwise
 *
 * @example
 * ```ts
 * async function* asyncGen() { yield 1; }
 * isAsyncGenerator(asyncGen()) // returns true - asyncGen() creates an async generator
 * isAsyncGenerator(asyncGen) // returns false - asyncGen is an async generator function
 * isAsyncGenerator(Promise.resolve()) // returns false
 * ```
 */
export function isAsyncGenerator(obj: unknown): obj is AsyncGenerator {
	if (!obj) return false;
	const asyncIterator = (obj as { [Symbol.asyncIterator]?: unknown })?.[Symbol.asyncIterator];
	if (typeof asyncIterator !== "function") return false;

	const instance = obj as { next?: unknown };
	return typeof instance.next === "function";
}

/**
 * Processes items sequentially, applying the given function to each item.
 * If any operation returns a Promise, switches to async mode and returns a Promise.
 * Otherwise, processes synchronously and returns the context directly.
 *
 * @template T - The type of items to process
 * @template C - The type of the context object
 * @param {T[]} items - The array of items to process
 * @param {(item: T) => unknown | Promise<unknown>} processFn - Function to apply to each item
 * @param {C} context - Context object that will be returned
 * @returns {C | Promise<C>} The context directly if all operations were synchronous, otherwise a Promise of the context
 *
 * @example
 * ```ts
 * // Synchronous processing
 * const numbers = [1, 2, 3];
 * const context = { sum: 0 };
 * processSequentially(numbers,
 *   (n) => { context.sum += n },
 *   context
 * ); // returns context immediately
 *
 * // Mixed sync/async processing
 * const urls = ['url1', 'url2'];
 * const results = { responses: [] };
 * await processSequentially(urls,
 *   async (url) => {
 *     const response = await fetch(url);
 *     results.responses.push(response);
 *   },
 *   results
 * ); // returns Promise<results>
 * ```
 */
export function processSequentially<T, C>(
	items: T[],
	processFn: (item: T) => unknown | Promise<unknown>,
	context: C
): C | Promise<C> {
	for (let i = 0; i < items.length; i++) {
		const result = processFn(items[i]);

		if (isPromise(result)) {
			return processRemainingAsync(result, items, processFn, i + 1).then(() => context);
		}
	}

	return context;
}

function processRemainingAsync<T>(
	initialPromise: Promise<unknown>,
	items: T[],
	processFn: (item: T) => unknown | Promise<unknown>,
	startIndex: number
): Promise<unknown> {
	let promise = initialPromise;

	for (let j = startIndex; j < items.length; j++) {
		promise = promise.then(() => processFn(items[j]));
	}

	return promise;
}

/**
 * Handles a value that might be a Promise, applying a transformation function.
 * If the value is a Promise, the function is applied to the resolved value.
 * If the value is not a Promise, the function is applied directly.
 *
 * @template T - The type of the input value
 * @template R - The type of the transformed value
 * @param {T | Promise<T>} value - The value or Promise to process
 * @param {(value: T) => R} fn - Function to apply to the (possibly resolved) value
 * @returns {R | Promise<R>} Either the direct result or a Promise resolving to the result
 *
 * @example
 * ```ts
 * // Synchronous usage
 * const result = handlePromiseOrValue(42, x => x * 2);
 * console.log(result); // 84
 *
 * // Promise usage
 * const promise = Promise.resolve(42);
 * const result2 = await handlePromiseOrValue(promise, x => x * 2);
 * console.log(result2); // 84
 *
 * // With async transform
 * const result3 = await handlePromiseOrValue(42, async x => {
 *   const multiplier = await fetchMultiplier();
 *   return x * multiplier;
 * });
 *
 * // With type transformation
 * interface User { id: number; name: string; }
 * const user: User = { id: 1, name: "Test" };
 * const formatted = handlePromiseOrValue(user,
 *   user => `${user.id}-${user.name}`
 * ); // returns "1-Test"
 * ```
 */
export function handlePromiseOrValue<T, R>(
	value: T | Promise<T>,
	fn: (value: T) => R
): R | Promise<R> {
	if (isPromise(value)) {
		return value.then(fn);
	}
	return fn(value);
}
