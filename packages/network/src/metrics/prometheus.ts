import {
	type AvgMinMax,
	type AvgMinMaxConfig,
	type Gauge,
	type GaugeConfig,
	type Histogram,
	type HistogramConfig,
	type MetricsRegister,
} from "@chainsafe/libp2p-gossipsub/metrics";
import {
	type Gauge as TypePromGauge,
	type Histogram as TypePromHistogram,
	type Pushgateway as TypePromPushgateway,
} from "prom-client";
// all those ts-expect-error are because prom-client is not typed at a file level but this allow us to not have to
// polyfill all the metrics related to node js itself which we don't enable this also allow tree shaking of the metrics library
// @ts-expect-error -- prom-client is not typed
import PromGauge from "prom-client/lib/gauge.js";
// @ts-expect-error -- prom-client is not typed
import PromHistogram from "prom-client/lib/histogram.js";
// @ts-expect-error -- prom-client is not typed
import PromPushgateway from "prom-client/lib/pushgateway.js";
// @ts-expect-error -- prom-client is not typed
import { globalRegistry } from "prom-client/lib/registry.js";

/**
 * PrometheusGauge wraps prom-client's Gauge to implement our Gauge interface.
 */
class PrometheusGauge<Labels extends Record<string, string | number> = Record<string, never>> implements Gauge<Labels> {
	private gauge: TypePromGauge<string>;
	private collects: Array<(metric: Gauge<Labels>) => void> = [];

	constructor(config: GaugeConfig<Labels>) {
		this.gauge = new PromGauge({
			name: config.name,
			help: config.help,
			labelNames: config.labelNames ? (config.labelNames as string[]) : [],
			collect: (): void => {
				for (const fn of this.collects) {
					fn(this);
				}
			},
		});
	}

	inc(value?: number): void;
	inc(labels: Labels, value?: number): void;
	inc(arg1?: number | Labels, arg2?: number): void {
		if (arg1 === undefined) {
			this.gauge.inc();
			return;
		}
		if (typeof arg1 === "number") {
			this.gauge.inc(arg1);
			return;
		}
		this.gauge.inc(arg1, arg2);
	}

	set(value: number): void;
	set(labels: Labels, value: number): void;
	set(arg1: number | Labels, arg2?: number): void {
		if (typeof arg1 === "number") {
			this.gauge.set(arg1);
			return;
		}
		this.gauge.set(arg1, arg2 ?? 0);
	}

	addCollect(fn: (metric: Gauge<Labels>) => void): void {
		this.collects.push(fn);
	}
}

/**
 * PrometheusHistogram wraps prom-client's Histogram to implement our Histogram interface.
 */
class PrometheusHistogram<Labels extends Record<string, string | number> = Record<string, never>>
	implements Histogram<Labels>
{
	private histogram: TypePromHistogram<string>;

	constructor(config: HistogramConfig<Labels>) {
		this.histogram = new PromHistogram({
			name: config.name,
			help: config.help,
			labelNames: config.labelNames ? (config.labelNames as string[]) : [],
			buckets: config.buckets,
		});
	}

	startTimer(): () => void {
		return this.histogram.startTimer();
	}

	observe(value: number): void;
	observe(labels: Labels, value: number): void;
	observe(arg1: number | Labels, arg2?: number): void {
		if (typeof arg1 === "number") {
			this.histogram.observe(arg1);
			return;
		}
		this.histogram.observe(arg1, arg2 ?? 0);
	}

	reset(): void {
		this.histogram.reset();
	}
}

/**
 * PrometheusAvgMinMax creates three Prometheus gauges (avg, min, max)
 * to represent the aggregated values.
 */
class PrometheusAvgMinMax<Labels extends Record<string, string | number> = Record<string, never>>
	implements AvgMinMax<Labels>
{
	private gaugeAvg: TypePromGauge<string>;
	private gaugeMin: TypePromGauge<string>;
	private gaugeMax: TypePromGauge<string>;

	constructor(config: AvgMinMaxConfig<Labels>) {
		const labelNames = config.labelNames ? (config.labelNames as string[]) : [];
		this.gaugeAvg = new PromGauge({
			name: `${config.name}_avg`,
			help: `${config.help} (average)`,
			labelNames,
		});
		this.gaugeMin = new PromGauge({
			name: `${config.name}_min`,
			help: `${config.help} (min)`,
			labelNames,
		});
		this.gaugeMax = new PromGauge({
			name: `${config.name}_max`,
			help: `${config.help} (max)`,
			labelNames,
		});
	}

	set(values: number[]): void;
	set(labels: Labels, values: number[]): void;
	set(arg1: number[] | Labels, arg2?: number[]): void {
		let labels: Record<string, string | number> = {};
		let values: number[];

		if (Array.isArray(arg1)) {
			values = arg1;
		} else {
			labels = arg1;
			values = arg2 ?? [];
		}

		if (values.length === 0) return;
		const sum = values.reduce((a, b) => a + b, 0);
		const avg = sum / values.length;
		const min = Math.min(...values);
		const max = Math.max(...values);
		this.gaugeAvg.set(labels, avg);
		this.gaugeMin.set(labels, min);
		this.gaugeMax.set(labels, max);
	}
}

/**
 * PrometheusMetricsRegister registers and returns Prometheus-backed metrics
 * and provides a method to push metrics to a Pushgateway.
 */
export class PrometheusMetricsRegister implements MetricsRegister {
	private pushgateway: TypePromPushgateway<"text/plain; version=0.0.4; charset=utf-8">;
	private interval: NodeJS.Timeout | undefined;

	/**
	 * Constructor for PrometheusMetricsRegister
	 * @param pushgatewayUrl - The URL of the Pushgateway
	 */
	constructor(pushgatewayUrl: string) {
		this.pushgateway = new PromPushgateway(pushgatewayUrl, {}, globalRegistry);
	}

	/**
	 * Start the metrics register
	 * @param jobName - The job name under which to push the metrics
	 * @param interval - The interval at which to push the metrics
	 */
	start(jobName: string, interval: number): void {
		this.interval = setInterval(() => {
			this.pushMetrics(jobName).catch((e) => {
				console.error("Error pushing metrics", e);
			});
		}, interval);
	}

	/**
	 * Stop the metrics register
	 */
	stop(): void {
		if (this.interval) clearInterval(this.interval);
	}

	/**
	 * Create a new Gauge
	 * @param config - The configuration for the Gauge
	 * @returns A new Gauge
	 */
	gauge<Labels extends Record<string, string | number> = Record<string, never>>(
		config: GaugeConfig<Labels>
	): Gauge<Labels> {
		return new PrometheusGauge<Labels>(config);
	}

	/**
	 * Create a new Histogram
	 * @param config - The configuration for the Histogram
	 * @returns A new Histogram
	 */
	histogram<Labels extends Record<string, string | number> = Record<string, never>>(
		config: HistogramConfig<Labels>
	): Histogram<Labels> {
		return new PrometheusHistogram<Labels>(config);
	}

	/**
	 * Create a new Histogram
	 * @param config - The configuration for the Histogram
	 * @returns A new Histogram
	 */
	avgMinMax<Labels extends Record<string, string | number> = Record<string, never>>(
		config: AvgMinMaxConfig<Labels>
	): AvgMinMax<Labels> {
		return new PrometheusAvgMinMax<Labels>(config);
	}

	/**
	 * Push metrics to the configured Pushgateway.
	 * @param jobName - The job name under which to push the metrics.
	 */
	async pushMetrics(jobName: string): Promise<void> {
		try {
			await this.pushgateway.pushAdd({ jobName });
		} catch (e) {
			console.error("Error pushing metrics", e);
		}
	}
}

/**
 * Create a new PrometheusMetricsRegister.
 * @param pushgatewayUrl - The URL of the Pushgateway.
 * @returns A new PrometheusMetricsRegister.
 */
export function createMetricsRegister(pushgatewayUrl: string): PrometheusMetricsRegister {
	return new PrometheusMetricsRegister(pushgatewayUrl);
}
