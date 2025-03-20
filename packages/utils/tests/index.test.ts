import { describe, expect, test } from "vitest";

import { handlePromiseOrValue, isAsyncGenerator, isGenerator, isPromise, processSequentially } from "../src/index.js";

describe("utils", () => {
	describe("isPromise", () => {
		test("should return true if the value is a promise", () => {
			expect(isPromise(Promise.resolve())).toBe(true);
			expect(isPromise(new Promise(() => {}))).toBe(true);
			expect(isPromise(Promise.reject().catch(() => {}))).toBe(true);
		});

		test("should return false if the value is not a promise", () => {
			expect(isPromise(1)).toBe(false);
			expect(isPromise("string")).toBe(false);
			expect(isPromise({})).toBe(false);
			expect(isPromise([])).toBe(false);
			expect(isPromise(null)).toBe(false);
			expect(isPromise(undefined)).toBe(false);
			expect(isPromise(() => {})).toBe(false);
			expect(isPromise(async () => {})).toBe(false);
			expect(
				isPromise(function* () {
					yield 1;
				})
			).toBe(false);
			expect(
				isPromise(async function* () {
					await Promise.resolve();
					yield 1;
				})
			).toBe(false);
			expect(isPromise({ then: 1 })).toBe(false);
		});
	});

	describe("isGenerator", () => {
		test("should return true if the value is a generator", () => {
			function* gen(): Generator<number, void, unknown> {
				yield 1;
			}
			const generator = gen();
			expect(isGenerator(generator)).toBe(true);

			const genObj = (function* (): Generator<number, void, unknown> {
				yield 1;
			})();
			expect(isGenerator(genObj)).toBe(true);
		});

		test("should return false if the value is not a generator", () => {
			expect(isGenerator(1)).toBe(false);
			expect(isGenerator("string")).toBe(false);
			expect(isGenerator({})).toBe(false);
			expect(isGenerator([])).toBe(false);
			expect(isGenerator(null)).toBe(false);
			expect(isGenerator(undefined)).toBe(false);
			expect(isGenerator(() => {})).toBe(false);
			expect(isGenerator(async () => {})).toBe(false);
			expect(
				isGenerator(function* () {
					yield 1;
				})
			).toBe(false); // generator function, not generator
			expect(
				isGenerator(async function* () {
					await Promise.resolve();
					yield 1;
				})
			).toBe(false);
			expect(isGenerator(Promise.resolve())).toBe(false);
			expect(isGenerator({ next: () => {} })).toBe(false);
			expect(isGenerator({ [Symbol.iterator]: () => {} })).toBe(false);
		});
	});

	describe("isAsyncGenerator", () => {
		test("should return true if the value is an async generator", () => {
			async function* asyncGen(): AsyncGenerator<number, void, unknown> {
				await Promise.resolve();
				yield 1;
			}
			const asyncGenerator = asyncGen();
			expect(isAsyncGenerator(asyncGenerator)).toBe(true);

			const asyncGenObj = (async function* (): AsyncGenerator<number, void, unknown> {
				await Promise.resolve();
				yield 1;
			})();
			expect(isAsyncGenerator(asyncGenObj)).toBe(true);
		});

		test("should return false if the value is not an async generator", () => {
			expect(isAsyncGenerator(1)).toBe(false);
			expect(isAsyncGenerator("string")).toBe(false);
			expect(isAsyncGenerator({})).toBe(false);
			expect(isAsyncGenerator([])).toBe(false);
			expect(isAsyncGenerator(null)).toBe(false);
			expect(isAsyncGenerator(undefined)).toBe(false);
			expect(isAsyncGenerator(() => {})).toBe(false);
			expect(isAsyncGenerator(async () => {})).toBe(false);
			expect(
				isAsyncGenerator(function* () {
					yield 1;
				})
			).toBe(false);
			expect(
				isAsyncGenerator(async function* () {
					await Promise.resolve();
					yield 1;
				})
			).toBe(false); // async generator function, not generator
			expect(isAsyncGenerator(Promise.resolve())).toBe(false);
			expect(isAsyncGenerator({ next: async () => {} })).toBe(false);
			expect(isAsyncGenerator({ [Symbol.asyncIterator]: () => {} })).toBe(false);
		});
	});

	describe("processSequentially", () => {
		test("should process items synchronously", () => {
			const items = [1, 2, 3];
			const results: number[] = [];
			const context = { sum: 0 };

			const result = processSequentially<number, typeof context>(
				items,
				(item: number) => {
					results.push(item);
					context.sum += item;
				},
				context
			);

			expect(result).toBe(context); // Should return context directly
			expect(results).toEqual([1, 2, 3]);
			expect(context.sum).toBe(6);
		});

		test("should process items asynchronously when encountering a promise", async () => {
			const items = [1, 2, 3];
			const results: number[] = [];
			const context = { sum: 0 };

			const result = processSequentially<number, typeof context>(
				items,
				async (item: number) => {
					await Promise.resolve();
					results.push(item);
					context.sum += item;
				},
				context
			);

			expect(result).toBeInstanceOf(Promise);
			await result;
			expect(results).toEqual([1, 2, 3]);
			expect(context.sum).toBe(6);
		});

		test("should switch to async mode when encountering first promise", async () => {
			const items = [1, 2, 3, 4];
			const results: number[] = [];
			const context = { sum: 0 };

			const result = processSequentially<number, typeof context>(
				items,
				(item: number) => {
					if (item > 2) {
						return Promise.resolve().then(() => {
							results.push(item);
							context.sum += item;
						});
					}
					results.push(item);
					context.sum += item;
				},
				context
			);

			expect(result).toBeInstanceOf(Promise);
			await result;
			expect(results).toEqual([1, 2, 3, 4]);
			expect(context.sum).toBe(10);
		});

		test("should maintain order even with mixed sync/async operations", async () => {
			const items = [100, 200, 300, 400];
			const results: number[] = [];
			const context = { sum: 0 };

			const result = processSequentially<number, typeof context>(
				items,
				(item: number) => {
					if (item === 200 || item === 400) {
						return Promise.resolve().then(() => {
							results.push(item);
							context.sum += item;
						});
					}
					results.push(item);
					context.sum += item;
				},
				context
			);

			expect(result).toBeInstanceOf(Promise);
			await result;
			expect(results).toEqual([100, 200, 300, 400]);
			expect(context.sum).toBe(1000);
		});

		test("should handle empty array", () => {
			const items: number[] = [];
			const context = { sum: 0 };

			const result = processSequentially<number, typeof context>(
				items,
				() => {
					throw new Error("Should not be called");
				},
				context
			);

			expect(result).toBe(context);
			expect(context.sum).toBe(0);
		});

		test("should strictly maintain sequential order with alternating sync/async operations", async () => {
			const items = [1, 2, 3, 4];
			const executionOrder: string[] = [];
			const context = { sum: 0 };

			const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

			const result = processSequentially<number, typeof context>(
				items,
				async (item: number) => {
					if (item % 2 === 1) {
						// Synchronous operations for odd numbers
						executionOrder.push(`sync-start-${item}`);
						context.sum += item;
						executionOrder.push(`sync-end-${item}`);
					} else {
						// Asynchronous operations for even numbers
						executionOrder.push(`async-start-${item}`);
						await delay(10); // Small delay to ensure async behavior
						context.sum += item;
						executionOrder.push(`async-end-${item}`);
					}
				},
				context
			);

			expect(result).toBeInstanceOf(Promise);
			await result;

			// Verify strict sequential ordering
			expect(executionOrder).toEqual([
				"sync-start-1",
				"sync-end-1",
				"async-start-2",
				"async-end-2",
				"sync-start-3",
				"sync-end-3",
				"async-start-4",
				"async-end-4",
			]);
			expect(context.sum).toBe(10);
		});
	});

	describe("handlePromiseOrValue", () => {
		test("should handle synchronous values", () => {
			const input = 42;
			const result = handlePromiseOrValue(input, (x: number) => x * 2);
			expect(result).toBe(84);
		});

		test("should handle promises", async () => {
			const input = Promise.resolve(42);
			const result = handlePromiseOrValue(input, (x: number) => x * 2);
			expect(result).toBeInstanceOf(Promise);
			expect(await result).toBe(84);
		});

		test("should handle async transform functions", async () => {
			const input = 42;
			const result = handlePromiseOrValue(input, async (x: number) => {
				await Promise.resolve();
				return x * 2;
			});
			expect(result).toBeInstanceOf(Promise);
			expect(await result).toBe(84);
		});

		test("should handle promise input with async transform", async () => {
			const input = Promise.resolve(42);
			const result = handlePromiseOrValue(input, async (x: number) => {
				await Promise.resolve();
				return x * 2;
			});
			expect(result).toBeInstanceOf(Promise);
			expect(await result).toBe(84);
		});

		test("should propagate errors from input promise", async () => {
			const error = new Error("Test error");
			const input = Promise.reject(error);
			await expect(handlePromiseOrValue(input, (x: unknown) => x)).rejects.toBe(error);
		});

		test("should propagate errors from transform function", () => {
			const error = new Error("Transform error");
			const input = 42;
			expect(() =>
				handlePromiseOrValue(input, () => {
					throw error;
				})
			).toThrow(error);
		});

		test("should handle null and undefined inputs", () => {
			expect(handlePromiseOrValue(null, (x: null) => x)).toBe(null);
			expect(handlePromiseOrValue(undefined, (x: undefined) => x)).toBe(undefined);
		});

		test("should handle complex transformations", () => {
			interface User {
				id: number;
				name: string;
			}
			const input: User = { id: 1, name: "Test" };
			const result = handlePromiseOrValue(input, (user: User) => ({
				...user,
				formatted: `${user.id}-${user.name}`,
			}));
			expect(result).toEqual({
				id: 1,
				name: "Test",
				formatted: "1-Test",
			});
		});
	});
});
