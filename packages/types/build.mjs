import * as esbuild from "esbuild";

import { esbuildConfig } from "../../esbuild-config.mjs";

await esbuild.build({
	...esbuildConfig,
	entryPoints: ["dist/src/index.js"],
	outfile: "dist/index.min.js",
});
