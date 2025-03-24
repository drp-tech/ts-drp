import * as esbuild from "esbuild";

import { esbuildConfigWithPolyfill } from "../../esbuild-config.mjs";
await esbuild.build({
	...esbuildConfigWithPolyfill,
	entryPoints: ["dist/src/index.js"],
	outfile: "dist/index.min.js",
});
