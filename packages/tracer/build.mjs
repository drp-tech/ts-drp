import * as esbuild from "esbuild";
import { readFileSync } from "fs";
import pascalCase from "pascalcase";
import { join } from "path";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
const globalName = pascalCase(pkg.name);
const umdPost = `(async()=>{if(typeof window!=='undefined'){const m=await import(import.meta.url);window.${globalName}=m}})();`;

await esbuild.build({
	entryPoints: ["dist/src/index.js"],
	bundle: true,
	minify: true,
	format: "esm",
	footer: { js: umdPost },
	globalName,
	define: {
		"global": "globalThis",
		"process.env.NODE_ENV": '"production"',
	},
	outfile: "dist/index.min.js",
});
