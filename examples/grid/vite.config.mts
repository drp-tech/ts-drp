import path from "node:path";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
	define: {
		"import.meta.env.VITE_RENDER_INFO_INTERVAL": process.env.VITE_RENDER_INFO_INTERVAL || 1000,
		"import.meta.env.VITE_ENABLE_TRACING": process.env.VITE_ENABLE_TRACING || false,
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
			"@ts-drp": path.resolve(__dirname, "../../packages"),
		},
	},
	// @ts-expect-error -- test is a valid property
	test: {
		exclude: ["**/node_modules", "**/e2e"],
	},
});
