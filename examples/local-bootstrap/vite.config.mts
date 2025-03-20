import path from "node:path";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
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
});
