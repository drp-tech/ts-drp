import { describe, expect, it } from "vitest";

import { Deferred } from "../src/promise/deferred/index.js";

describe("Deferred promise tests", () => {
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
