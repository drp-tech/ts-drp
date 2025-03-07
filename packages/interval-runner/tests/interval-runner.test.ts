import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
			expect(() => new IntervalRunner({ interval: -1, fn: (): boolean => true })).toThrow(
				"Interval must be greater than 0"
			);
		});

		it("should create instance with valid interval", () => {
			const runner = new IntervalRunner({ interval: 1000, fn: (): boolean => true });
			expect(runner.interval).toBe(1000);
			expect(runner.state).toBe("stopped");
		});
	});

	describe("with arguments", () => {
		it("should pass arguments to the callback function", async () => {
			const callback = vi.fn().mockImplementation((_msg: string, _num: number) => true);
			const runner = new IntervalRunner<[string, number]>({ fn: callback });

			runner.start(["test", 42]);
			expect(callback).toHaveBeenCalledWith("test", 42);

			await vi.advanceTimersByTimeAsync(10_000);
			expect(callback).toHaveBeenCalledTimes(2);
			expect(callback).toHaveBeenLastCalledWith("test", 42);
		});

		it("should handle async callback with arguments", async () => {
			const callback = vi.fn().mockImplementation(async (_msg: string, num: number) => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				return num < 42;
			});

			const runner = new IntervalRunner<[string, number]>({ interval: 1000, fn: callback });
			runner.start(["test", 41]);

			await vi.advanceTimersByTimeAsync(100); // Wait for first execution
			expect(callback).toHaveBeenCalledWith("test", 41);
			expect(runner.state).toBe("running");

			await vi.advanceTimersByTimeAsync(1000); // Wait for interval
			await vi.advanceTimersByTimeAsync(100); // Wait for second execution
			expect(callback).toHaveBeenLastCalledWith("test", 41);
			expect(callback).toHaveBeenCalledTimes(2);
		});

		it("should handle generator callback with arguments", async () => {
			const callback = vi.fn().mockImplementation(function* (_msg: string, num: number) {
				yield num <= 42;
			});

			const runner = new IntervalRunner<[string, number]>({ interval: 1000, fn: callback });
			runner.start(["test", 42]);

			expect(callback).toHaveBeenCalledWith("test", 42);
			expect(runner.state).toBe("running");

			await vi.advanceTimersByTimeAsync(1000);
			expect(callback).toHaveBeenCalledTimes(2);
			expect(callback).toHaveBeenLastCalledWith("test", 42);
		});
	});

	describe("error handling", () => {
		it("should stop when callback throws an error", async () => {
			const error = new Error("Test error");
			const callback = vi.fn().mockImplementation(() => {
				throw error;
			});

			const runner = new IntervalRunner({ interval: 1000, fn: callback });
			runner.start();

			await new Promise(process.nextTick);

			expect(callback).toHaveBeenCalledTimes(1);
			expect(runner.state).toBe("stopped");
		});

		it("should stop when async callback rejects", async () => {
			const error = new Error("Async test error");
			const callback = vi.fn().mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				throw error;
			});

			const runner = new IntervalRunner({ interval: 1000, fn: callback });
			runner.start();

			await vi.advanceTimersByTimeAsync(100);
			expect(callback).toHaveBeenCalledTimes(1);
			expect(runner.state).toBe("stopped");
		});

		it("should stop when generator callback throws", async () => {
			let count = 0;
			const error = new Error("Generator test error");
			const callback = vi.fn(function* () {
				count++;
				if (count === 1) {
					yield true;
				} else {
					throw error;
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

		it("should stop when async generator callback throws", async () => {
			const error = new Error("Async generator test error");
			let count = 0;
			const callback = vi.fn(async function* () {
				await new Promise((resolve) => setTimeout(resolve, 100));
				count++;
				if (count === 1) {
					yield true;
				} else {
					throw error;
				}
			});

			const runner = new IntervalRunner({ interval: 1000, fn: callback });
			runner.start();

			await vi.advanceTimersByTimeAsync(100);
			expect(callback).toHaveBeenCalledTimes(1);
			expect(runner.state).toBe("running");

			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(100);
			expect(callback).toHaveBeenCalledTimes(2);
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

		it("should stop immediately when stop is called during interval wait", async () => {
			const callback = vi.fn().mockReturnValue(true);
			const runner = new IntervalRunner({ interval: 1000, fn: callback });

			runner.start();
			expect(callback).toHaveBeenCalledTimes(1);

			// Advance timer halfway through the interval
			await vi.advanceTimersByTimeAsync(500);
			runner.stop();

			// Advance timer past when the next callback would have happened
			await vi.advanceTimersByTimeAsync(1000);
			expect(callback).toHaveBeenCalledTimes(1); // Should not have been called again
			expect(runner.state).toBe("stopped");
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

		it("should handle error in callback function", async () => {
			const error = new Error("Test error");
			const callback = vi.fn().mockImplementation(() => {
				throw error;
			});

			const runner = new IntervalRunner({ interval: 1000, fn: callback });
			runner.start();

			expect(callback).toHaveBeenCalledTimes(1);
			await new Promise(process.nextTick);
			expect(runner.state).toBe("stopped");
		});

		it("should handle async callback rejection", async () => {
			const error = new Error("Async test error");
			const callback = vi.fn().mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				throw error;
			});

			const runner = new IntervalRunner({ interval: 1000, fn: callback });
			runner.start();

			await vi.advanceTimersByTimeAsync(100);
			expect(callback).toHaveBeenCalledTimes(1);
			expect(runner.state).toBe("stopped");
		});

		it("should handle generator callback throw", async () => {
			const error = new Error("Generator test error");
			let count = 0;
			const callback = vi.fn(function* () {
				count++;
				if (count === 1) {
					yield true;
				} else {
					throw error;
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

		it("should handle async generator callback throw", async () => {
			const error = new Error("Async generator test error");
			let count = 0;
			const callback = vi.fn(async function* () {
				await new Promise((resolve) => setTimeout(resolve, 100));
				count++;
				if (count === 1) {
					yield true;
				} else {
					throw error;
				}
			});

			const runner = new IntervalRunner({ interval: 1000, fn: callback });
			runner.start();

			await vi.advanceTimersByTimeAsync(100);
			expect(callback).toHaveBeenCalledTimes(1);
			expect(runner.state).toBe("running");

			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(100);
			expect(callback).toHaveBeenCalledTimes(2);
			expect(runner.state).toBe("stopped");
		});
	});

	it("should log that the runner is stopped when scheduleNext detects state 0", async () => {
		const callback = vi.fn(async function* () {
			await Promise.resolve();
			yield true;
		});
		const runner = new IntervalRunner({ interval: 100, fn: callback, logConfig: {} });
		// Spy on the _logger.info method.
		const loggerInfoSpy = vi.spyOn(runner["_logger"], "info");

		// Start and then immediately stop the runner.
		runner.start();
		await vi.advanceTimersByTimeAsync(100);
		runner["_intervalId"] = null;
		runner.stop();
		await vi.advanceTimersByTimeAsync(100);

		// Verify that the logger was called with the "Interval runner stopped" message.
		expect(loggerInfoSpy).toHaveBeenCalledWith("Interval runner was already stopped");
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
			const runner = new IntervalRunner({ interval: 1000, fn: (): boolean => true });
			runner.start();
			expect(() => runner.start()).toThrow("Interval runner is already running");
		});

		it("should throw error when stopping already stopped interval", () => {
			const runner = new IntervalRunner({ interval: 1000, fn: (): boolean => true });
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
