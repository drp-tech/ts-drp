import path from "path";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
	server: {
		proxy: {
			"/metrics": {
				target: "http://localhost:9091",
				changeOrigin: true,
			},
		},
	},
	define: {
		"import.meta.env.VITE_RENDER_INFO_INTERVAL": process.env.VITE_RENDER_INFO_INTERVAL || 1000,
		"import.meta.env.VITE_ENABLE_TRACING": process.env.VITE_ENABLE_TRACING || false,
		"import.meta.env.VITE_ENABLE_PROMETHEUS_METRICS": process.env.VITE_ENABLE_PROMETHEUS_METRICS || false,
	},
	build: {
		target: "esnext",
	},
	plugins: [nodePolyfills()],
	optimizeDeps: {
		esbuildOptions: {
			target: "esnext",
		},
	},
	resolve: {
		alias: {
			"vite-plugin-node-polyfills/shims/process": path.resolve(
				__dirname,
				"node_modules/vite-plugin-node-polyfills/shims/process"
			),
		},
	},
	// @ts-expect-error -- test is a valid property
	test: {
		exclude: ["**/node_modules", "**/e2e"],
	},
});
