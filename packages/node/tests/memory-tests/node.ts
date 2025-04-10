import { IntervalRunner } from "@ts-drp/interval-runner";
import { DRPNode } from "@ts-drp/node";
import { Command } from "commander";

export const program = new Command();
program.name("drp-node").version("0.0.1");
program
	.option("--seed <seed>", "private key seed")
	.option("--topic <topic>", "topic to subscribe to")
	.option("--peer_discovery_interval <ms>", "peer discovery interval")
	.option("--stop <ms>", "stop after ms")
	.option("--messages <num>", "number of messages per second");

program.parse(process.argv);
const opts = program.opts();

// Peer discovery interval
let peer_discovery_interval = parseInt(opts.peer_discovery_interval);
if (isNaN(peer_discovery_interval)) {
	peer_discovery_interval = 5000;
}

// setup stop time
const stop_time = parseInt(opts.stop);
if (isNaN(stop_time)) {
	throw new Error("Invalid stop time");
}

// setup messages
const num_messages = parseInt(opts.messages);
if (isNaN(num_messages)) {
	throw new Error("Invalid messages");
}

async function runNode(): Promise<void> {
	// setup DRPNode
	const node = new DRPNode({
		network_config: {
			bootstrap_peers: ["/ip4/127.0.0.1/tcp/50000/ws/p2p/16Uiu2HAmTY71bbCHtmYD3nvVKUGbk7NWqLBbPFNng4jhaXJHi3W5"],
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
		log_config: {
			template: "[%t] %l: %n",
		},
	});

	const delay = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

	// 10 seconds for connection
	if (opts.seed === "peer1") {
		await Promise.all([node.start(), delay(10000)]);
	} else {
		await delay(5000);
		await node.start();
	}

	node.networkNode.subscribe(opts.topic);
	node.messageQueueManager.subscribe(opts.topic, (message) => {
		const value = Buffer.from(message.data).toString("utf-8");
		const now = Date.now();
		console.log(`${value} received at ${now}`);
	});

	// setup hash function
	async function digestMessage(message: string): Promise<string> {
		const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
		const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8); // hash the message
		const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
		const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(""); // convert bytes to hex string
		return hashHex;
	}

	let value = await digestMessage(opts.seed);

	// setup interval runner
	const runner = new IntervalRunner({
		interval: 1000 / num_messages,
		fn: async (): Promise<boolean> => {
			await node.networkNode.broadcastMessage(opts.topic, {
				sender: node.networkNode.peerId,
				type: 0,
				objectId: opts.topic,
				data: new Uint8Array(Buffer.from(value)),
			});
			const now = Date.now();
			console.log(`${value} created at ${now}`);
			value = await digestMessage(value);
			console.error(node.networkNode.getAllPeers());
			return true;
		},
	});

	runner.start();

	setTimeout(() => {
		runner.stop();
		process.exit(0);
	}, stop_time - 10000);
}

void (async (): Promise<void> => {
	await runNode();
})();
