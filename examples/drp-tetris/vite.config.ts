import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss(), nodePolyfills()],
	build: {
		target: "esnext",
	},
	optimizeDeps: {
		esbuildOptions: {
			target: "esnext",
		},
	},
});
