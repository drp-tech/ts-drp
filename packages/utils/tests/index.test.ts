import { describe, expect, test } from "vitest";

import { isPromise, isGenerator, isAsyncGenerator } from "../src/index.js";

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
					yield 1;
				})
			).toBe(false);
			expect(isPromise({ then: 1 })).toBe(false);
		});
	});

	describe("isGenerator", () => {
		test("should return true if the value is a generator", () => {
			function* gen() {
				yield 1;
			}
			const generator = gen();
			expect(isGenerator(generator)).toBe(true);

			const genObj = (function* () {
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
			async function* asyncGen() {
				yield 1;
			}
			const asyncGenerator = asyncGen();
			expect(isAsyncGenerator(asyncGenerator)).toBe(true);

			const asyncGenObj = (async function* () {
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
					yield 1;
				})
			).toBe(false); // async generator function, not generator
			expect(isAsyncGenerator(Promise.resolve())).toBe(false);
			expect(isAsyncGenerator({ next: async () => {} })).toBe(false);
			expect(isAsyncGenerator({ [Symbol.asyncIterator]: () => {} })).toBe(false);
		});
	});
});
