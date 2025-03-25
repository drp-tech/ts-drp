import { context, type Tracer as OtTracer, type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { type IMetrics } from "@ts-drp/types";
import { isAsyncGenerator, isGenerator, isPromise } from "@ts-drp/utils";

import { initContextManager } from "./context-manager.js";

let enabled = false;
let provider: WebTracerProvider | undefined;
let exporter: OTLPTraceExporter | undefined;

const DEFAULT_EXPORTER_URL = "http://127.0.0.1:4318/v1/traces";
const DEFAULT_EXPORTER_HEADERS = {
	"Content-Type": "application/json",
	"Access-Control-Allow-Headers": "*",
	"Access-Control-Allow-Origin": "*",
};

export type EnableTracingOptions = {
	provider?: {
		serviceName?: string;
		exporterUrl?: string;
		exporterHeaders?: Record<string, string>;
	};
};

export const enableTracing = (opts: EnableTracingOptions = {}): void => {
	enabled = true;
	initContextManager();
	initProvider(opts.provider);
};

// disableTracing should reset the tracer, provider, and exporter
// there for testing purposes
export const disableTracing = (): void => {
	enabled = false;
	provider = undefined;
	exporter = undefined;
};

async function wrapPromise<T>(promise: Promise<T>, span: Span): Promise<T> {
	return promise
		.then((res) => {
			span.setStatus({ code: SpanStatusCode.OK });
			return res;
		})
		.catch((err: Error) => {
			span.recordException(err);
			span.setStatus({ code: SpanStatusCode.ERROR, message: err.toString() });
			throw err;
		})
		.finally(() => {
			span.end();
		});
}

function wrapGenerator<T>(gen: Generator<T>, span: Span): Generator<T> {
	const iter = gen[Symbol.iterator]();

	const wrapped: Generator<T> = {
		next: () => {
			try {
				const res = iter.next();

				if (res.done === true) {
					span.setStatus({ code: SpanStatusCode.OK });
					span.end();
				}
				return res;
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				span.recordException(error);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error.toString(),
				});
				span.end();

				throw error;
			}
		},
		return: (value) => {
			return iter.return(value);
		},
		throw: (err) => {
			return iter.throw(err);
		},
		[Symbol.iterator]: () => {
			return wrapped;
		},
	};

	return wrapped;
}

function wrapAsyncGenerator<T>(gen: AsyncGenerator<T>, span: Span): AsyncGenerator<T> {
	const iter = gen[Symbol.asyncIterator]();

	const wrapped: AsyncGenerator<T> = {
		next: async () => {
			try {
				const res = await iter.next();

				if (res.done === true) {
					span.setStatus({ code: SpanStatusCode.OK });
					span.end();
				}
				return res;
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				span.recordException(error);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error.toString(),
				});
				span.end();

				throw error;
			}
		},
		return: async (value) => {
			return iter.return(value);
		},
		throw: async (err) => {
			return iter.throw(err);
		},
		[Symbol.asyncIterator]: () => {
			return wrapped;
		},
	};

	return wrapped;
}

export class OpentelemetryMetrics implements IMetrics {
	private tracer: OtTracer | undefined;

	constructor(tracerName: string) {
		if (!provider) return;
		this.tracer = provider.getTracer(tracerName);
	}

	public traceFunc<Args extends unknown[], Return>(
		name: string,
		fn: (...args: Args) => Return,
		setAttributes?: (span: Span, ...args: Args) => void
	): (...args: Args) => Return {
		return (...args: Args): Return => {
			if (!this.tracer || !enabled) {
				return fn(...args);
			}
			const parentContext = context.active();
			const span = this.tracer.startSpan(name, {}, parentContext);

			if (setAttributes) {
				setAttributes(span, ...args);
			}

			let result: Return;
			const childContext = trace.setSpan(parentContext, span);
			try {
				result = context.with(childContext, fn, undefined, ...args);
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				span.recordException(error);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error.toString(),
				});
				span.end();
				throw error;
			}

			if (isPromise<unknown>(result)) {
				return wrapPromise(result, span) as Return;
			}
			if (isGenerator(result)) {
				return wrapGenerator(result, span) as Return;
			}
			if (isAsyncGenerator(result)) {
				return wrapAsyncGenerator(result, span) as Return;
			}

			span.setStatus({ code: SpanStatusCode.OK });
			span.end();
			return result;
		};
	}
}

const initExporter = (opts: EnableTracingOptions["provider"]): OTLPTraceExporter => {
	if (exporter) return exporter;

	exporter = new OTLPTraceExporter({
		url: opts?.exporterUrl ?? DEFAULT_EXPORTER_URL,
		headers: opts?.exporterHeaders ? opts.exporterHeaders : DEFAULT_EXPORTER_HEADERS,
	});

	return exporter;
};

const initProvider = (opts: EnableTracingOptions["provider"]): void => {
	if (provider) return;

	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: opts?.serviceName ?? "unknown_service",
	});
	const exporter = initExporter(opts);
	const spanProcessor = new BatchSpanProcessor(exporter, {
		// Configuration options for batching
		maxQueueSize: 2048, // Maximum number of spans kept in the queue before dropping
		scheduledDelayMillis: 5000, // Interval for sending queued spans in milliseconds
		exportTimeoutMillis: 30000, // Timeout for exporting a batch
		maxExportBatchSize: 512, // Maximum number of spans per batch
	});

	provider = new WebTracerProvider({
		resource,
		spanProcessors: [spanProcessor],
	});

	provider.register();
};

export const flush = async (): Promise<void> => {
	await provider?.forceFlush();
};
