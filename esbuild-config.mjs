import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import { readFileSync } from "fs";
import pascalCase from "pascalcase";
import { join } from "path";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
const globalName = pascalCase(pkg.name);
const umdPost = `(async()=>{if(typeof window!=='undefined'){const m=await import(import.meta.url);window.${globalName}=m}})();`;

export const esbuildConfig = {
	bundle: true,
	minify: true,
	format: "esm",
	platform: "browser",
	footer: { js: umdPost },
	globalName,
	define: {
		"global": "globalThis",
		"process.env.NODE_ENV": '"production"',
	},
};

export const esbuildConfigWithPolyfill = {
	plugins: [NodeModulesPolyfillPlugin(), NodeGlobalsPolyfillPlugin()],
};
