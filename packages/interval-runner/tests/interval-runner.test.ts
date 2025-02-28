import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { IntervalRunner } from "../src/index.js";

describe("IntervalRunner", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("should throw error if interval is less than or equal to 0", () => {
			expect(() => new IntervalRunner({ interval: 0, fn: () => true })).toThrow(
				"Interval must be greater than 0"
			);
			expect(() => new IntervalRunner({ interval: -1, fn: () => true })).toThrow(
				"Interval must be greater than 0"
			);
		});

		it("should create instance with valid interval", () => {
			const runner = new IntervalRunner({ interval: 1000, fn: () => true });
			expect(runner.interval).toBe(1000);
			expect(runner.state).toBe("stopped");
		});
	});

	describe("with normal function", () => {
		it("should run callback at specified intervals", async () => {
			const callback = vi.fn().mockReturnValue(true);
			const runner = new IntervalRunner({ interval: 1000, fn: callback });

			runner.start();
			expect(callback).toHaveBeenCalledTimes(1); // Should be called immediately

			await vi.advanceTimersByTimeAsync(1000);
			expect(callback).toHaveBeenCalledTimes(2);
		});

		it("should stop when callback returns false", async () => {
			let count = 0;
			const callback = vi.fn().mockImplementation(() => {
				count++;
				return count < 2;
			});

			const runner = new IntervalRunner({ interval: 1000, fn: callback });
			runner.start();
			expect(callback).toHaveBeenCalledTimes(1); // Should be called immediately
			expect(runner.state).toBe("running");

			await vi.advanceTimersByTimeAsync(1000);
			expect(callback).toHaveBeenCalledTimes(2);
			expect(runner.state).toBe("stopped");
		});
	});

	describe("with promise function", () => {
		it("should handle async callbacks", async () => {
			let count = 0;
			const callback = vi.fn().mockImplementation(async () => {
				count++;
				await new Promise((resolve) => setTimeout(resolve, 100));
				return count < 2;
			});

			const runner = new IntervalRunner({ interval: 1000, fn: callback });
			runner.start();

			// First execution
			await vi.advanceTimersByTimeAsync(100); // Wait for the setTimeout in the callback
			expect(callback).toHaveBeenCalledTimes(1);
			expect(runner.state).toBe("running");

			// Second execution
			await vi.advanceTimersByTimeAsync(1000); // Wait for the interval
			await vi.advanceTimersByTimeAsync(100); // Wait for the setTimeout in the callback
			expect(callback).toHaveBeenCalledTimes(2);
			expect(runner.state).toBe("stopped");
		});
	});

	describe("with generator function", () => {
		it("should handle generator callbacks", async () => {
			let count = 0;
			const callback = vi.fn(function* () {
				count++;
				if (count === 1) {
					yield true;
				} else {
					yield false;
				}
			});

			const runner = new IntervalRunner({ interval: 1000, fn: callback });
			runner.start();
			expect(callback).toHaveBeenCalledTimes(1);
			expect(runner.state).toBe("running");

			await vi.advanceTimersByTimeAsync(1000);
			expect(callback).toHaveBeenCalledTimes(2);
			expect(runner.state).toBe("stopped");
		});
	});

	describe("with async generator function", () => {
		it("should handle async generator callbacks", async () => {
			let count = 0;
			const callback = vi.fn(async function* () {
				count++;
				await new Promise((resolve) => setTimeout(resolve, 100));
				if (count === 1) {
					yield true;
				} else {
					yield false;
				}
			});

			const runner = new IntervalRunner({ interval: 1000, fn: callback });
			runner.start();
			expect(callback).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(100); // Wait for the first yield
			expect(runner.state).toBe("running");

			await vi.advanceTimersByTimeAsync(1000); // Wait for the interval
			expect(callback).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(100); // Wait for the second yield
			expect(runner.state).toBe("stopped");
		});
	});

	describe("start and stop", () => {
		it("should throw error when starting already running interval", () => {
			const runner = new IntervalRunner({ interval: 1000, fn: () => true });
			runner.start();
			expect(() => runner.start()).toThrow("Interval runner is already running");
		});

		it("should throw error when stopping already stopped interval", () => {
			const runner = new IntervalRunner({ interval: 1000, fn: () => true });
			expect(() => runner.stop()).toThrow("Interval runner is not running");
		});

		it("should properly stop running interval", () => {
			const callback = vi.fn().mockReturnValue(true);
			const runner = new IntervalRunner({ interval: 1000, fn: callback });

			runner.start();
			vi.advanceTimersByTime(1000);
			expect(callback).toHaveBeenCalledTimes(1);

			runner.stop();
			vi.advanceTimersByTime(2000);
			expect(callback).toHaveBeenCalledTimes(1);
			expect(runner.state).toBe("stopped");
		});
	});
});
