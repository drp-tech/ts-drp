/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_BOOTSTRAP_PEERS: string;
	readonly VITE_DISCOVERY_INTERVAL: number;
	readonly VITE_RENDER_INFO_INTERVAL: number;
	readonly VITE_ENABLE_TRACING: boolean;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
