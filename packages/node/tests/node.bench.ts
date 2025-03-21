import { type GossipSub } from "@chainsafe/libp2p-gossipsub";
import { type DRPNetworkNodeConfig, type DRPNodeConfig, type KeychainOptions, type LoggerOptions } from "@ts-drp/types";
import Benchmark from "benchmark";

import { DRPNode } from "../src/index.js";

interface createNodeOptions {
	isBootstrap?: boolean;
	id: number;
}

let btNode: DRPNode | undefined;
async function getBootstrapNode(): Promise<DRPNode> {
	if (!btNode) {
		btNode = await createNode({ id: -1, isBootstrap: true });
		await btNode.start();
	}
	return btNode;
}

async function getNetworkConfiguration(logConfig: LoggerOptions, isBootstrap = false): Promise<DRPNetworkNodeConfig> {
	if (isBootstrap) {
		return {
			bootstrap: isBootstrap,
			listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws", "/ip4/0.0.0.0/tcp/0"],
			bootstrap_peers: [],
			log_config: logConfig,
		};
	}

	const bootstrapNode = await getBootstrapNode();
	const bootstrapPeers = bootstrapNode.networkNode.getMultiaddrs();
	return {
		listen_addresses: ["/p2p-circuit", "/webrtc"],
		bootstrap_peers: bootstrapPeers,
		log_config: logConfig,
	};
}

async function getNodeConfiguration({ isBootstrap = false, id }: createNodeOptions): Promise<DRPNodeConfig> {
	const keychainConfig: KeychainOptions = { private_key_seed: `seed-${id}` };
	const logConfig: LoggerOptions = {
		//level: "debug",
	};
	const networkConfig = await getNetworkConfiguration(logConfig, isBootstrap);

	return {
		log_config: logConfig,
		network_config: networkConfig,
		keychain_config: keychainConfig,
	};
}

async function createNode(options: createNodeOptions): Promise<DRPNode> {
	const config = await getNodeConfiguration(options);
	const node = new DRPNode(config);
	await node.start();
	return node;
}

async function createNodes(count: number): Promise<DRPNode[]> {
	const nodes: DRPNode[] = [];
	for (let i = 0; i < count; i++) {
		const node = await createNode({ id: i });
		nodes.push(node);
	}
	return nodes;
}

// Define a topic for message exchange
const TOPIC = "benchmark-topic";
const MESSAGE_SIZE = 1024; // 1KB message
const NUMBER_OF_MESSAGES = Number.parseInt(process.argv[2], 10) || 1000;

function createMessage(size: number): Uint8Array {
	const buffer = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		buffer[i] = Math.floor(Math.random() * 256);
	}
	return buffer;
}

async function setupMessageHandlers(nodes: DRPNode[]): Promise<void> {
	for (const node of nodes) {
		const pubsub = node.networkNode["_pubsub"] as GossipSub;
		pubsub.subscribe(TOPIC);
	}

	// Wait a bit for subscription propagation
	await new Promise((resolve) => setTimeout(resolve, 1000));
}

const suite = new Benchmark.Suite();

// Benchmark for sending messages between nodes
async function runMessageBenchmark(): Promise<void> {
	const nodes = await createNodes(3);
	await setupMessageHandlers(nodes);

	const message = createMessage(MESSAGE_SIZE);
	const sender = nodes[0];

	suite.add(`Send ${NUMBER_OF_MESSAGES} messages (${MESSAGE_SIZE} bytes each)`, {
		defer: true,
		fn: async (deferred: Benchmark.Deferred) => {
			let sentCount = 0;

			// Set up message reception counter
			let receivedCount = 0;
			const onMessage = (): void => {
				receivedCount++;
				if (receivedCount >= NUMBER_OF_MESSAGES * (nodes.length - 1)) {
					// All messages received by all other nodes
					deferred.resolve();
				}
			};

			// Set up message handlers for receiving nodes
			for (let i = 1; i < nodes.length; i++) {
				const pubsub = nodes[i].networkNode["_pubsub"] as GossipSub;
				pubsub.addEventListener("gossipsub:message", onMessage);
			}

			// Send messages
			for (let i = 0; i < NUMBER_OF_MESSAGES; i++) {
				const pubsub = sender.networkNode["_pubsub"] as GossipSub;
				await pubsub.publish(TOPIC, message);
				sentCount++;
			}

			// If no messages were received, resolve after timeout
			setTimeout(() => {
				if (!deferred.resolved) {
					console.log(`Timeout: Sent ${sentCount}, received ${receivedCount}`);
					deferred.resolve();
				}
			}, 10000);
		},
	});

	// Add more benchmarks here as needed

	suite
		.on("cycle", (event: Benchmark.Event) => {
			console.log(String(event.target));
		})
		.on("complete", function (this: Benchmark.Suite) {
			console.log(`Fastest is ${this.filter("fastest").map("name")}`);

			// Clean up nodes
			for (const node of nodes) {
				node.stop().catch(console.error);
			}
			if (btNode) {
				btNode.stop().catch(console.error);
			}
		})
		.run({ async: true });
}

// Run the benchmark
runMessageBenchmark().catch(console.error);
