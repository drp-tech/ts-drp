import { Span } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { disableTracing, enableTracing, flush, OpentelemetryMetrics } from "../src/index.js";
import { IMetrics } from "../src/interface.js";

// Mock OpenTelemetry dependencies
vi.mock("@opentelemetry/api", () => {
	const mockSpan = {
		setAttribute: vi.fn(),
		recordException: vi.fn(),
		setStatus: vi.fn(),
		end: vi.fn(),
		_spanContext: {},
		kind: 0,
		attributes: {},
		links: [],
		events: [],
		duration: [],
		ended: false,
		instrumentationLibrary: { name: "test", version: "1.0.0" },
		resource: { attributes: {} },
		startTime: [0, 0],
		status: { code: 0 },
		name: "test",
	};
	const mockTracer = {
		startSpan: vi.fn(() => mockSpan),
	};
	return {
		trace: {
			setSpan: vi.fn(),
			getTracer: vi.fn(() => mockTracer),
		},
		context: {
			active: vi.fn(),
			with: vi.fn((_, fn, _thisArg, ...args) => fn(...args)),
			setGlobalContextManager: vi.fn(),
		},
		SpanStatusCode: {
			OK: 1,
			ERROR: 2,
		},
	};
});

vi.mock("@opentelemetry/context-async-hooks", () => ({
	AsyncHooksContextManager: vi.fn().mockImplementation(() => ({
		enable: vi.fn(),
		disable: vi.fn(),
	})),
}));

vi.mock("@opentelemetry/context-zone", () => ({
	ZoneContextManager: vi.fn().mockImplementation(() => ({
		enable: vi.fn(),
		disable: vi.fn(),
	})),
}));

vi.mock("@opentelemetry/sdk-trace-web", () => {
	const mockSpan = {
		setAttribute: vi.fn(),
		recordException: vi.fn(),
		setStatus: vi.fn(),
		end: vi.fn(),
		_spanContext: {},
		kind: 0,
		attributes: {},
		links: [],
		events: [],
		duration: [],
		ended: false,
		instrumentationLibrary: { name: "test", version: "1.0.0" },
		resource: { attributes: {} },
		startTime: [0, 0],
		status: { code: 0 },
		name: "test",
	};
	const mockTracer = {
		startSpan: vi.fn(() => mockSpan),
	};

	const WebTracerProvider = vi.fn().mockImplementation(() => ({
		register: vi.fn(),
		getTracer: vi.fn(() => mockTracer),
		forceFlush: vi.fn().mockResolvedValue(undefined),
		_config: {},
		_registeredSpanProcessors: [],
		_tracers: new Map(),
		activeSpanProcessor: {
			onStart: vi.fn(),
			onEnd: vi.fn(),
			shutdown: vi.fn(),
			forceFlush: vi.fn(),
		},
		resource: {
			attributes: {},
			merge: vi.fn(),
		},
		shutdown: vi.fn(),
		getActiveSpanProcessor: vi.fn(),
		addSpanProcessor: vi.fn(),
	}));

	const BatchSpanProcessor = vi.fn();

	return { WebTracerProvider, BatchSpanProcessor };
});

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
	OTLPTraceExporter: vi.fn(),
}));

describe("tracing lifecycle", () => {
	let metrics: IMetrics;

	beforeEach(() => {
		vi.clearAllMocks();
		metrics = new OpentelemetryMetrics("metric");
	});

	test("should enable and disable tracing", async () => {
		enableTracing({
			provider: {
				serviceName: "test",
				exporterUrl: "http://localhost:9999",
			},
		});

		// Check if the tracer provider was initialized correctly
		expect(WebTracerProvider).toHaveBeenCalled();
		expect(OTLPTraceExporter).toHaveBeenCalledWith({
			url: "http://localhost:9999",
			headers: expect.any(Object),
		});

		const fn = metrics.traceFunc("test", (a: number) => a + 1);
		expect(fn(1)).toBe(2);

		disableTracing();

		// Should still work when disabled, just without tracing
		const result = fn(1);
		expect(result).toBe(2);
	});

	test("should allow flushing traces", async () => {
		enableTracing();

		expect(WebTracerProvider).toHaveBeenCalled();
		const mockProvider = vi.mocked(WebTracerProvider).mock.results[0].value;

		await flush();
		expect(mockProvider.forceFlush).toHaveBeenCalled();
		disableTracing();
	});

	describe("wrapping functions", () => {
		beforeEach(() => {
			vi.clearAllMocks();
			enableTracing();
		});

		test("should wrap synchronous functions", () => {
			const fn = metrics.traceFunc("test", (a: number, b: number) => a + b);
			expect(fn(1, 2)).toBe(3);
		});

		test("should wrap async functions", async () => {
			const fn = metrics.traceFunc("test", async (a: number, b: number) => a + b);
			expect(await fn(1, 2)).toBe(3);
		});

		test("should wrap generator functions", () => {
			const fn = metrics.traceFunc("test", function* (a: number) {
				yield a + 1;
				yield a + 2;
			});
			const gen = fn(1);
			expect(gen.next().value).toBe(2);
			expect(gen.next().value).toBe(3);
			expect(gen.next().done).toBe(true);
		});

		test("should wrap async generator functions", async () => {
			const fn = metrics.traceFunc("test", async function* (a: number) {
				yield a + 1;
				yield a + 2;
			});
			const gen = fn(1);
			expect((await gen.next()).value).toBe(2);
			expect((await gen.next()).value).toBe(3);
			expect((await gen.next()).done).toBe(true);
		});

		test("should handle errors in synchronous functions", () => {
			const fn = metrics.traceFunc("test", () => {
				throw new Error("test error");
			});
			expect(() => fn()).toThrow("test error");
		});

		test("should handle errors in async functions", async () => {
			const fn = metrics.traceFunc("test", async () => {
				throw new Error("test error");
			});
			await expect(fn()).rejects.toThrow("test error");
		});

		test("should apply custom attributes", () => {
			const fn = metrics.traceFunc(
				"test",
				(a: number) => a + 1,
				(span: Span, a: number) => {
					span.setAttribute("input", a);
				}
			);
			expect(fn(1)).toBe(2);
		});

		test("should trace functions that return promises", async () => {
			const tracedPromise = metrics.traceFunc("promise-test", () => Promise.resolve(42));
			const result = await tracedPromise();
			expect(result).toBe(42);
		});

		test("should trace functions that return generators", () => {
			const tracedGenerator = metrics.traceFunc("generator-test", function* () {
				yield 1;
				yield 2;
				return 3;
			});
			const gen = tracedGenerator();
			expect(gen.next().value).toBe(1);
			expect(gen.next().value).toBe(2);
			const final = gen.next();
			expect(final.value).toBe(3);
			expect(final.done).toBe(true);
		});

		test("should trace functions that return async generators", async () => {
			const tracedAsyncGenerator = metrics.traceFunc("async-generator-test", async function* () {
				yield 1;
				yield 2;
				return 3;
			});
			const gen = tracedAsyncGenerator();
			expect((await gen.next()).value).toBe(1);
			expect((await gen.next()).value).toBe(2);
			const final = await gen.next();
			expect(final.value).toBe(3);
			expect(final.done).toBe(true);
		});

		test("should handle errors in returned promises", async () => {
			const tracedPromise = metrics.traceFunc("error-promise-test", () =>
				Promise.reject(new Error("promise error"))
			);
			await expect(tracedPromise()).rejects.toThrow("promise error");
		});

		test("should handle errors in returned generators", () => {
			const tracedGenerator = metrics.traceFunc("error-generator-test", function* () {
				yield 1;
				throw new Error("generator error");
			});
			const gen = tracedGenerator();
			expect(gen.next().value).toBe(1);
			expect(() => gen.next()).toThrow("generator error");
		});

		test("should handle errors in returned async generators", async () => {
			const tracedAsyncGenerator = metrics.traceFunc(
				"error-async-generator-test",
				async function* () {
					yield 1;
					throw new Error("async generator error");
				}
			);
			const gen = tracedAsyncGenerator();
			expect((await gen.next()).value).toBe(1);
			await expect(gen.next()).rejects.toThrow("async generator error");
		});
	});
});
