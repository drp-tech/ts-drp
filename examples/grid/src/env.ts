interface EnvConfig {
	readonly bootstrapPeers: string;
	readonly enableTracing: boolean;
	readonly renderInfoInterval: number;
	readonly discoveryInterval: number;
	readonly enablePrometheusMetrics: boolean;
	readonly mode: string;
}

function getBooleanFromEnv(key: keyof ImportMetaEnv): boolean {
	const value = import.meta.env[key];
	return value === "true" || value === "1" || Boolean(value);
}

function getNumberFromEnv(key: keyof ImportMetaEnv): number {
	const value = import.meta.env[key];
	return Number(value);
}

export const env: EnvConfig = {
	bootstrapPeers: import.meta.env.VITE_BOOTSTRAP_PEERS,
	enableTracing: getBooleanFromEnv("VITE_ENABLE_TRACING"),
	renderInfoInterval: getNumberFromEnv("VITE_RENDER_INFO_INTERVAL"),
	discoveryInterval: getNumberFromEnv("VITE_DISCOVERY_INTERVAL"),
	enablePrometheusMetrics: getBooleanFromEnv("VITE_ENABLE_PROMETHEUS_METRICS"),
	mode: import.meta.env.MODE,
};
