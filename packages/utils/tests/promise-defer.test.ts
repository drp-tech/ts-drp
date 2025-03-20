import { describe, expect, it } from "vitest";

import { Deferred } from "../src/promise/deferred/index.js";

describe("DeferredPromise functionality", () => {
	it("should resolve with undefined for void type", async () => {
		const deferred = new Deferred<void>();
		deferred.resolve();
		await expect(deferred.promise).resolves.toBeUndefined();
	});

	it("should resolve with a string for string type", async () => {
		const deferred = new Deferred<string>();
		deferred.resolve("foo");
		await expect(deferred.promise).resolves.toBe("foo");
	});

	it("should reject for void type", async () => {
		const deferred = new Deferred<void>();
		// You can pass an error if you want to test rejection with an error message:
		deferred.reject(new Error("void error"));
		await expect(deferred.promise).rejects.toThrow("void error");
	});

	it("should reject for string type", async () => {
		const deferred = new Deferred<string>();
		const error = new Error("foo");
		deferred.reject(error);
		await expect(deferred.promise).rejects.toBe(error);
	});
});
