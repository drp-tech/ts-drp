import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hrtimePolyfill, uptimePolyfill } from "../src/metrics/polyfill-process.js";

describe("Process Polyfills", () => {
	let uptimeFn: () => number;
	let hrtimeFn: ((time?: [number, number]) => [number, number]) & { bigint(): bigint };
	beforeEach(() => {
		vi.useFakeTimers();
		uptimeFn = uptimePolyfill();
		hrtimeFn = hrtimePolyfill();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("uptime polyfill", () => {
		it("should return correct uptime in seconds", () => {
			// Advance time by 2.5 seconds
			vi.advanceTimersByTime(2500);

			const uptime = uptimeFn();
			expect(uptime).toBe(2.5);
		});

		it("should handle multiple calls correctly", () => {
			// First call after 1 second
			vi.advanceTimersByTime(1000);
			expect(uptimeFn()).toBe(1);

			// Second call after another 2 seconds
			vi.advanceTimersByTime(2000);
			expect(uptimeFn()).toBe(3);
		});
	});

	describe("hrtime polyfill", () => {
		it("should return correct time tuple", () => {
			// Advance time by 1.5 seconds
			vi.advanceTimersByTime(1500);

			const [seconds, nanoseconds] = hrtimeFn();
			expect(seconds).toBe(1);
			expect(nanoseconds).toBe(500000000); // 0.5 seconds in nanoseconds
		});

		it("should handle relative time measurement", () => {
			// First call after 1 second
			vi.advanceTimersByTime(1000);
			const firstTime = hrtimeFn();
			expect(firstTime[0]).toBe(1);
			expect(firstTime[1]).toBe(0);

			// Second call after another 0.5 seconds
			vi.advanceTimersByTime(500);
			const [diffSeconds, diffNanoseconds] = hrtimeFn(firstTime);
			expect(diffSeconds).toBe(0);
			expect(diffNanoseconds).toBe(500000000); // 0.5 seconds in nanoseconds
		});

		it("should handle bigint conversion", () => {
			// Advance time by 1.5 seconds
			vi.advanceTimersByTime(1500);

			const bigintTime = hrtimeFn.bigint();
			expect(bigintTime).toBe(1500000000n); // 1.5 seconds in nanoseconds
		});

		it("should handle negative nanosecond differences", () => {
			// First call after 1.5 seconds
			vi.advanceTimersByTime(1500);
			const firstTime = hrtimeFn();

			// Second call after another 0.3 seconds
			vi.advanceTimersByTime(300);
			const [diffSeconds, diffNanoseconds] = hrtimeFn(firstTime);

			// Should be 0 seconds and 300000000 nanoseconds
			expect(diffSeconds).toBe(0);
			expect(diffNanoseconds).toBe(300000000);
		});

		it("should handle crossing second boundaries", () => {
			// First call at 0.8 seconds
			vi.advanceTimersByTime(800);
			const firstTime = process.hrtime();

			// Second call at 1.2 seconds
			vi.advanceTimersByTime(400);
			const [diffSeconds, diffNanoseconds] = hrtimeFn(firstTime);

			// Should be 0 seconds and 400000000 nanoseconds
			expect(diffSeconds).toBe(0);
			expect(diffNanoseconds).toBe(400000000);
		});
	});
});
