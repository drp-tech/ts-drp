import { type GossipSub, type GossipsubMessage } from "@chainsafe/libp2p-gossipsub";
import { type Libp2p, type Libp2pEvents } from "@libp2p/interface";
import { AddMulDRP } from "@ts-drp/blueprints";
import { ObjectACL } from "@ts-drp/object";
import {
	type DRPNetworkNodeConfig,
	type DRPNodeConfig,
	type IDRPObject,
	type KeychainOptions,
	type LoggerOptions,
	type Message,
	MessageType,
} from "@ts-drp/types";
import Benchmark from "benchmark";
import { promisify } from "util";

import { DRPNode } from "../src/index.js";

interface createNodeOptions {
	isBootstrap?: boolean;
	id: number;
}

let btNode: DRPNode | undefined;

function waitForLibp2pEvent<K extends keyof Libp2pEvents>(
	libp2p: Libp2p,
	type: K,
	filter: (event: Libp2pEvents[K]) => boolean,
	callback: (error: Error | null, event: Libp2pEvents[K]) => void
): void {
	const listener = (event: Libp2pEvents[K]): void => {
		if (filter(event)) {
			libp2p.removeEventListener(type, listener);
			callback(null, event);
		}
	};

	libp2p.addEventListener(type, listener);
}

async function getBootstrapNode(): Promise<DRPNode> {
	if (!btNode) {
		btNode = await createNode({ id: -1, isBootstrap: true });
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
			pubsub: {
				peer_discovery_interval: 30_000,
			},
		};
	}

	const bootstrapNode = await getBootstrapNode();
	const bootstrapPeers = bootstrapNode.networkNode.getMultiaddrs();
	return {
		listen_addresses: ["/p2p-circuit", "/webrtc"],
		bootstrap_peers: bootstrapPeers,
		log_config: logConfig,
		pubsub: {
			peer_discovery_interval: 30_000,
		},
	};
}

async function getNodeConfiguration({ isBootstrap = false, id }: createNodeOptions): Promise<DRPNodeConfig> {
	const keychainConfig: KeychainOptions = { private_key_seed: `seed-${id}` };
	const logConfig: LoggerOptions = {
		level: "silent",
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
	if (options.isBootstrap) {
		await node.start();
		return node;
	}
	const btLibp2p = (await getBootstrapNode()).networkNode["_node"] as Libp2p;
	await Promise.all([
		node.start(),
		promisify(waitForLibp2pEvent)(
			btLibp2p,
			"peer:identify",
			(event) => event.detail.peerId.toString() === node.networkNode.peerId && event.detail.listenAddrs.length > 0
		),
	]);
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

function createMessage(size: number): Uint8Array {
	const buffer = new Uint8Array(size);
	for (let i = 0; i < size; i++) {
		buffer[i] = Math.floor(Math.random() * 256);
	}
	return buffer;
}

async function setupMessageHandlers(nodes: DRPNode[], topic: string): Promise<void> {
	for (const node of nodes) {
		const pubsub = node.networkNode["_pubsub"] as GossipSub;
		pubsub.subscribe(topic);
	}

	// Wait a bit for subscription propagation
	await new Promise((resolve) => setTimeout(resolve, 1000));
}

// Benchmark for sending messages between nodes
async function runMessageBenchmark(numberOfMessages: number, numberOfNodes: number, time: number): Promise<void> {
	const suite = new Benchmark.Suite();
	const nodes = await createNodes(numberOfNodes);
	await setupMessageHandlers(nodes, TOPIC);

	const message = createMessage(MESSAGE_SIZE);
	const totalMessages = numberOfMessages * (nodes.length - 1);

	let index = 0;
	suite.add(`Send ${numberOfMessages} messages for ${numberOfNodes} nodes in ${time} seconds`, {
		defer: true,
		minTime: time,
		maxTime: time,
		fn: async (deferred: Benchmark.Deferred) => {
			let receivedCount = 0;
			const promises: { resolver(value: unknown): void; promise: Promise<unknown> }[] = Array(totalMessages)
				.fill(null)
				.map(() => {
					let resolver: (value: unknown) => void;
					const promise = new Promise((resolve) => {
						resolver = resolve;
					});
					// @ts-expect-error -- resolver is not used
					return { resolver, promise };
				});

			let promiseIdx = 0;
			const onMessage = (msg: CustomEvent<GossipsubMessage>): void => {
				if (msg.detail.msg.topic !== TOPIC) return;
				receivedCount++;
				promises[promiseIdx++].resolver(true);
				if (receivedCount >= totalMessages) {
					deferred.resolve();
				}
			};

			// Set up message handlers
			for (let i = 0; i < nodes.length; i++) {
				const pubsub = nodes[i].networkNode["_pubsub"] as GossipSub;
				pubsub.addEventListener("gossipsub:message", onMessage);
			}

			// Send messages
			const pubsubSender = nodes[index % nodes.length].networkNode["_pubsub"] as GossipSub;
			for (let i = 0; i < numberOfMessages; i++) {
				await pubsubSender.publish(TOPIC, message);
			}
			await Promise.all(promises.map((p) => p.promise));

			// Clean up listeners
			for (let i = 0; i < nodes.length; i++) {
				const pubsub = nodes[i].networkNode["_pubsub"] as GossipSub;
				pubsub.removeEventListener("gossipsub:message", onMessage);
			}
			index++;
		},
	});

	return new Promise<void>((resolve) => {
		suite
			.on("cycle", (event: Benchmark.Event) => {
				console.log(String(event.target));
			})
			.on("complete", async function (this: Benchmark.Suite) {
				//const benchmark = this.pop() as unknown as Benchmark.Target;
				//const totalOps = benchmark.count ?? 0;
				//const opsPerSec = benchmark.hz ?? 0;

				//console.log("=== Benchmark Result ===");
				//console.log(`Total Operations: ${totalOps}`);
				//console.log(`Operations per second: ${opsPerSec.toFixed(2)}`);
				//console.log(`Benchmark duration: ${(totalOps / opsPerSec).toFixed(2)} seconds`);

				// Cleanup nodes
				await Promise.all(nodes.map((node): Promise<void> => node.stop().catch(console.error)));
				if (btNode) {
					await btNode.stop().catch(console.error);
					btNode = undefined;
				}
				resolve();
			})
			.run({ async: true });
	});
}

async function runObjectBenchmark(numberOfMessages: number, numberOfNodes: number, time: number): Promise<void> {
	const suite = new Benchmark.Suite();
	const nodes = await createNodes(numberOfNodes);
	const objects: IDRPObject<AddMulDRP>[] = [];
	const admins = nodes.map((node) => node.networkNode.peerId);
	const acl = new ObjectACL({ admins, permissionless: true });
	for (let i = 0; i < nodes.length; i++) {
		const obj = new AddMulDRP();
		if (i === 0) {
			objects.push(await nodes[i].createObject({ id: "addmul", drp: obj, acl, log_config: { level: "silent" } }));
			continue;
		}
		objects.push(await nodes[i].connectObject({ id: "addmul", drp: obj, acl, log_config: { level: "silent" } }));
	}

	await setupMessageHandlers(nodes, objects[0].id);

	let promiseIdx = 0;
	let promises: { resolver(value: unknown): void; promise: Promise<unknown> }[] | undefined = undefined;
	const totalMessages = numberOfMessages * (nodes.length - 1);
	const getPromises = (totalMessages: number): { resolver(value: unknown): void; promise: Promise<unknown> }[] => {
		if (promises) return promises;
		promiseIdx = 0;
		promises = Array(totalMessages)
			.fill(null)
			.map(() => {
				let resolver: (value: unknown) => void;
				const promise = new Promise((resolve) => {
					resolver = resolve;
				});
				// @ts-expect-error -- resolver is not used
				return { resolver, promise };
			});
		return promises;
	};

	const onMessage = (msg: Message): Promise<void> => {
		if (msg.type !== MessageType.MESSAGE_TYPE_UPDATE) return Promise.resolve();
		getPromises(totalMessages)[promiseIdx++].resolver(true);
		return Promise.resolve();
	};

	for (let i = 0; i < nodes.length; i++) {
		nodes[i].messageQueueManager.subscribe(objects[i].id, onMessage);
	}

	let index = 0;
	suite.add(`Send ${numberOfMessages} add in addmul for ${numberOfNodes} nodes in ${time} seconds`, {
		defer: true,
		minTime: time,
		maxTime: time,
		fn: async (deferred: Benchmark.Deferred) => {
			const addMul = objects[index % nodes.length].drp;
			for (let i = 0; i < numberOfMessages; i++) {
				const a = Math.floor(Math.random() * 10) + 1;
				addMul?.add(a);
			}
			await Promise.all(getPromises(totalMessages).map((p) => p.promise));
			promises = undefined;
			index++;
			deferred.resolve();
		},
	});

	return new Promise<void>((resolve) => {
		suite
			.on("cycle", (event: Benchmark.Event) => {
				console.log(String(event.target));
			})
			.on("complete", async function (this: Benchmark.Suite) {
				//const benchmark = this.pop() as unknown as Benchmark.Target;
				//const totalOps = benchmark.count ?? 0;
				//const opsPerSec = benchmark.hz ?? 0;

				//console.log("=== Benchmark Result ===");
				//console.log(`Total Operations: ${totalOps}`);
				//console.log(`Operations per second: ${opsPerSec.toFixed(2)}`);
				//console.log(`Benchmark duration: ${(totalOps / opsPerSec).toFixed(2)} seconds`);

				// Cleanup nodes
				await Promise.all(nodes.map((node): Promise<void> => node.stop().catch(console.error)));
				if (btNode) {
					await btNode.stop().catch(console.error);
					btNode = undefined;
				}
				//console.log("done3");
				resolve();
			})
			.run({ async: true });
	});
}

async function runBenchmarks(): Promise<void> {
	await runMessageBenchmark(1, 3, 10);
	await runObjectBenchmark(1, 3, 10);
	process.exit(0);
}

runBenchmarks().catch(console.error);
