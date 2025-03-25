/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_BOOTSTRAP_PEERS: string;
	readonly VITE_DISCOVERY_INTERVAL: number;
	readonly VITE_RENDER_INFO_INTERVAL: number;
	readonly VITE_ENABLE_TRACING: boolean;
	readonly VITE_ENABLE_PROMETHEUS_METRICS: boolean;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
