import { describe, expect, it } from "vitest";

import { Deferred } from "../src/deferred.js";

describe("Deferred", () => {
	it("should resolve with a value", async () => {
		const deferred = new Deferred<string>();
		const value = "test";

		deferred.resolve(value);
		await expect(deferred.promise).resolves.toBe(value);
	});

	it("should resolve with a promise", async () => {
		const deferred = new Deferred<string>();
		const value = "test";

		deferred.resolve(Promise.resolve(value));
		await expect(deferred.promise).resolves.toBe(value);
	});

	it("should reject with a reason", async () => {
		const deferred = new Deferred<string>();
		const error = new Error("test error");

		deferred.reject(error);
		await expect(deferred.promise).rejects.toThrow(error);
	});

	it("should reject without a reason", async () => {
		const deferred = new Deferred<string>();

		deferred.reject();
		await expect(deferred.promise).rejects.toBeUndefined();
	});

	it("should handle multiple resolve calls", async () => {
		const deferred = new Deferred<string>();
		const value1 = "first";
		const value2 = "second";

		deferred.resolve(value1);
		deferred.resolve(value2); // Second resolve should be ignored
		await expect(deferred.promise).resolves.toBe(value1);
	});

	it("should handle multiple reject calls", async () => {
		const deferred = new Deferred<string>();
		const error1 = new Error("first error");
		const error2 = new Error("second error");

		deferred.reject(error1);
		deferred.reject(error2); // Second reject should be ignored
		await expect(deferred.promise).rejects.toThrow(error1);
	});
});
