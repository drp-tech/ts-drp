import { DRPNode } from "@ts-drp/node";
import { Command } from "commander";

export const program = new Command();
program.name("drp-bootstrap").version("0.0.1");

program
	.option("--seed <seed>", "private key seed")
	.option("--peer_discovery_interval <ms>", "peer discovery interval")
	.option("--stop <ms>", "stop time in ms");

program.parse(process.argv);
const opts = program.opts();

// Peer discovery interval
let peer_discovery_interval = parseInt(opts.peer_discovery_interval);
if (isNaN(peer_discovery_interval)) {
	peer_discovery_interval = 5000;
}

let stop_time = parseInt(opts.stop);
if (isNaN(stop_time)) {
	stop_time = 20000;
}

const bootstrap_node = new DRPNode({
	network_config: {
		listen_addresses: ["/ip4/0.0.0.0/tcp/50000/ws", "/ip4/0.0.0.0/tcp/50001"],
		announce_addresses: [`/ip4/0.0.0.0/tcp/50000/ws`, `/ip4/0.0.0.0/tcp/50001`],
		bootstrap: true,
		bootstrap_peers: [],
		log_config: {
			template: "[%t] %l: %n",
		},
		pubsub: {
			peer_discovery_interval,
		},
	},
	keychain_config: {
		private_key_seed: opts.seed,
	},
});

void (async (): Promise<void> => {
	await bootstrap_node.start();
	console.error(bootstrap_node.networkNode.getMultiaddrs());

	setTimeout(() => {
		process.exit(0);
	}, stop_time);
})();
