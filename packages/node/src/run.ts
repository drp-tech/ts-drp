import { program } from "./cli/index.js";
import { loadConfig } from "./config.js";
import { type DRPNodeConfig, DRPNode } from "./index.js";
import { init as rpc_init } from "./rpc/index.js";

export const run = async (port: number = 6969): Promise<void> => {
	program.parse(process.argv);
	const opts = program.opts();
	const config: DRPNodeConfig | undefined = loadConfig(opts.config);

	const node = new DRPNode(config);
	await node.start();
	rpc_init(node, port);
};

run().catch((e) => console.error("Failed to start node: ", e));
