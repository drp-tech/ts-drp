import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { timeoutSignal } from "../src/promise/timeout/index.js";

describe("timeoutSignal", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: 0 });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it.concurrent("should abort after the specified timeout", async () => {
		const { signal, cleanup } = timeoutSignal(100);

		// Create a promise that will be aborted
		const promise = new Promise((_, reject) => {
			signal.addEventListener("abort", () => {
				reject(new Error("Aborted"));
			});
		});

		vi.advanceTimersByTime(300);

		// Wait for the timeout to occur
		await expect(promise).rejects.toThrow("Aborted");
		cleanup();
	});

	it.concurrent("should not abort if cleanup is called before timeout", () => {
		const { signal, cleanup } = timeoutSignal(100);

		// Cleanup before timeout
		cleanup();

		vi.advanceTimersByTime(300);

		// Signal should not be aborted
		expect(signal.aborted).toBe(false);
	});

	it.concurrent("should create a new AbortSignal each time", () => {
		const { signal: signal1 } = timeoutSignal(100);
		const { signal: signal2 } = timeoutSignal(100);

		expect(signal1).not.toBe(signal2);
	});
});
