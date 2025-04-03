// @ts-expect-error -- prom-client is not typed
import PromGauge from "prom-client/lib/gauge";
// @ts-expect-error -- prom-client is not typed
import PromHistogram from "prom-client/lib/histogram";
// @ts-expect-error -- prom-client is not typed
import Pushgateway from "prom-client/lib/pushgateway";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { createMetricsRegister, type PrometheusMetricsRegister } from "../src/metrics/prometheus.js";

vi.mock("prom-client/lib/registry", () => ({
	globalRegistry: {},
}));

vi.mock("prom-client/lib/pushgateway", () => ({
	default: vi.fn().mockImplementation(() => ({
		pushAdd: vi.fn().mockResolvedValue(undefined),
	})),
}));

vi.mock("prom-client/lib/histogram", () => ({
	default: vi.fn().mockImplementation(() => ({
		observe: vi.fn(),
		reset: vi.fn(),
		startTimer: vi.fn().mockReturnValue(() => {}),
	})),
}));

vi.mock("prom-client/lib/gauge", () => ({
	default: vi.fn().mockImplementation(() => ({
		set: vi.fn(),
		inc: vi.fn(),
	})),
}));

describe("PrometheusMetricsRegister", () => {
	let metricsRegister: PrometheusMetricsRegister;
	const pushgatewayUrl = "http://localhost:9091";

	const MockPromGauge: Mock = PromGauge;
	const MockPromHistogram: Mock = PromHistogram;
	const MockPushgateway: Mock = Pushgateway;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		metricsRegister = createMetricsRegister(pushgatewayUrl);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("gauge", () => {
		it("should create a gauge", () => {
			const gauge = metricsRegister.gauge({
				name: "test_gauge",
				help: "Test gauge",
			});

			expect(gauge).toBeDefined();
			expect(MockPromGauge).toHaveBeenCalled();
		});

		it("should handle gauge.inc() with no arguments", () => {
			const gauge = metricsRegister.gauge({
				name: "test_gauge",
				help: "Test gauge",
			});

			gauge.inc();
			expect(MockPromGauge).toHaveBeenCalled();
			expect(MockPromGauge.mock.results[0].value.inc).toHaveBeenCalled();
		});

		it("should handle gauge.inc() with value", () => {
			const gauge = metricsRegister.gauge({
				name: "test_gauge",
				help: "Test gauge",
			});

			gauge.inc(10);
			expect(MockPromGauge.mock.results[0].value.inc).toHaveBeenCalledWith(10);
		});

		it("should handle gauge.inc() with labels and value", () => {
			const gauge = metricsRegister.gauge<{ method: string }>({
				name: "test_gauge",
				help: "Test gauge",
				labelNames: ["method"],
			});

			gauge.inc({ method: "GET" }, 5);
			expect(MockPromGauge.mock.results[0].value.inc).toHaveBeenCalledWith({ method: "GET" }, 5);
		});

		it("should handle gauge.set() with value", () => {
			const gauge = metricsRegister.gauge({
				name: "test_gauge",
				help: "Test gauge",
			});

			gauge.set(10);
			expect(MockPromGauge.mock.results[0].value.set).toHaveBeenCalledWith(10);
		});

		it("should handle gauge.set() with labels and value", () => {
			const gauge = metricsRegister.gauge<{ method: string }>({
				name: "test_gauge",
				help: "Test gauge",
				labelNames: ["method"],
			});

			gauge.set({ method: "POST" }, 5);
			expect(MockPromGauge.mock.results[0].value.set).toHaveBeenCalledWith({ method: "POST" }, 5);
		});

		it("should handle addCollect method", () => {
			const gauge = metricsRegister.gauge({
				name: "test_gauge",
				help: "Test gauge",
			});

			const collectFn = vi.fn();
			gauge.addCollect(collectFn);

			// Simulate collect being called
			const collectCallback = MockPromGauge.mock.calls[0][0].collect;
			collectCallback();

			expect(collectFn).toHaveBeenCalled();
		});
	});

	describe("histogram", () => {
		it("should create a histogram", () => {
			const histogram = metricsRegister.histogram({
				name: "test_histogram",
				help: "Test histogram",
				buckets: [0.1, 0.5, 1, 2, 5],
			});

			expect(histogram).toBeDefined();
			expect(MockPromHistogram).toHaveBeenCalled();
		});

		it("should handle histogram.observe() with value", () => {
			const histogram = metricsRegister.histogram({
				name: "test_histogram",
				help: "Test histogram",
				buckets: [0.1, 0.5, 1, 2, 5],
			});

			histogram.observe(10);
			expect(MockPromHistogram.mock.results[0].value.observe).toHaveBeenCalledWith(10);
		});

		it("should handle histogram.observe() with labels and value", () => {
			const histogram = metricsRegister.histogram<{ method: string }>({
				name: "test_histogram",
				help: "Test histogram",
				labelNames: ["method"],
				buckets: [0.1, 0.5, 1, 2, 5],
			});

			histogram.observe({ method: "GET" }, 5);
			expect(MockPromHistogram.mock.results[0].value.observe).toHaveBeenCalledWith({ method: "GET" }, 5);
		});

		it("should handle histogram.startTimer()", () => {
			const histogram = metricsRegister.histogram({
				name: "test_histogram",
				help: "Test histogram",
				buckets: [0.1, 0.5, 1, 2, 5],
			});

			const endTimer = histogram.startTimer();
			expect(MockPromHistogram.mock.results[0].value.startTimer).toHaveBeenCalled();
			expect(endTimer).toBeInstanceOf(Function);
		});

		it("should handle histogram.reset()", () => {
			const histogram = metricsRegister.histogram({
				name: "test_histogram",
				help: "Test histogram",
				buckets: [0.1, 0.5, 1, 2, 5],
			});

			histogram.reset();
			expect(MockPromHistogram.mock.results[0].value.reset).toHaveBeenCalled();
		});
	});

	describe("avgMinMax", () => {
		it("should create an avgMinMax", () => {
			const avgMinMax = metricsRegister.avgMinMax({
				name: "test_avg_min_max",
				help: "Test avg min max",
			});

			expect(avgMinMax).toBeDefined();
			// Should create 3 gauges (avg, min, max)
			expect(MockPromGauge).toHaveBeenCalledTimes(3);
		});

		it("should handle avgMinMax.set() with values", () => {
			const avgMinMax = metricsRegister.avgMinMax({
				name: "test_avg_min_max",
				help: "Test avg min max",
			});

			avgMinMax.set([1, 2, 3, 4, 5]);

			// Should have set avg, min, and max values
			expect(MockPromGauge.mock.results[0].value.set).toHaveBeenCalledWith({}, 3); // avg
			expect(MockPromGauge.mock.results[1].value.set).toHaveBeenCalledWith({}, 1); // min
			expect(MockPromGauge.mock.results[2].value.set).toHaveBeenCalledWith({}, 5); // max
		});

		it("should handle avgMinMax.set() with labels and values", () => {
			const avgMinMax = metricsRegister.avgMinMax<{ method: string }>({
				name: "test_avg_min_max",
				help: "Test avg min max",
				labelNames: ["method"],
			});

			avgMinMax.set({ method: "GET" }, [10, 20, 30]);

			// Should have set avg, min, and max values with labels
			expect(MockPromGauge.mock.results[0].value.set).toHaveBeenCalledWith({ method: "GET" }, 20); // avg
			expect(MockPromGauge.mock.results[1].value.set).toHaveBeenCalledWith({ method: "GET" }, 10); // min
			expect(MockPromGauge.mock.results[2].value.set).toHaveBeenCalledWith({ method: "GET" }, 30); // max
		});

		it("should handle avgMinMax.set() with empty array", () => {
			const avgMinMax = metricsRegister.avgMinMax({
				name: "test_avg_min_max",
				help: "Test avg min max",
			});

			avgMinMax.set([]);

			// Shouldn't call set for empty array
			expect(MockPromGauge.mock.results[0].value.set).not.toHaveBeenCalled();
		});
	});

	describe("start and stop", () => {
		it("should start pushing metrics at interval", async () => {
			const pushMetricsSpy = vi.spyOn(metricsRegister, "pushMetrics").mockResolvedValue();
			metricsRegister.start("test-job", 5000);

			expect(pushMetricsSpy).not.toHaveBeenCalled();

			// Advance timer to trigger the interval
			await vi.advanceTimersByTimeAsync(5000);

			expect(pushMetricsSpy).toHaveBeenCalledWith("test-job");

			// Advance timer again to confirm multiple calls
			await vi.advanceTimersByTimeAsync(5000);

			expect(pushMetricsSpy).toHaveBeenCalledTimes(2);

			metricsRegister.stop();
			pushMetricsSpy.mockRestore();
		});

		it("should stop pushing metrics", async () => {
			const pushMetricsSpy = vi.spyOn(metricsRegister, "pushMetrics").mockResolvedValue();
			metricsRegister.start("test-job", 5000);

			await vi.advanceTimersByTimeAsync(5000);
			expect(pushMetricsSpy).toHaveBeenCalledTimes(1);

			metricsRegister.stop();

			// Clear previous calls
			pushMetricsSpy.mockClear();

			// Advance timer again to confirm it's stopped
			await vi.advanceTimersByTimeAsync(5000);

			expect(pushMetricsSpy).not.toHaveBeenCalled();
			pushMetricsSpy.mockRestore();
		});

		it("should handle error when pushing metrics", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const mockPushgateway = {
				pushAdd: vi.fn().mockRejectedValue(new Error("Push error")),
			};

			// Access private property for testing
			// @ts-expect-error - accessing private property
			metricsRegister.pushgateway = mockPushgateway;

			await metricsRegister.pushMetrics("test-job");

			expect(mockPushgateway.pushAdd).toHaveBeenCalledWith({ jobName: "test-job" });
			expect(consoleSpy).toHaveBeenCalledWith("Error pushing metrics", expect.any(Error));

			consoleSpy.mockRestore();
		});

		it("should handle error in interval callback", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			vi.spyOn(metricsRegister, "pushMetrics").mockRejectedValue(new Error("Interval error"));

			metricsRegister.start("test-job", 5000);

			await vi.advanceTimersByTimeAsync(5000);

			expect(consoleSpy).toHaveBeenCalledWith("Error pushing metrics", expect.any(Error));

			metricsRegister.stop();
			consoleSpy.mockRestore();
		});
	});

	describe("pushMetrics", () => {
		it("should push metrics to pushgateway", async () => {
			await metricsRegister.pushMetrics("test-job");

			const mockPushgatewayCalls = MockPushgateway.mock.results;
			expect(mockPushgatewayCalls[0].value.pushAdd).toHaveBeenCalledWith({ jobName: "test-job" });
		});
	});
});
