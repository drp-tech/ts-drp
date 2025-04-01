import { type GossipSub, type MeshPeer } from "@chainsafe/libp2p-gossipsub";
import { type Connection, type IdentifyResult, type Libp2p, type SubscriptionChangeData } from "@libp2p/interface";
import { type DRPNetworkNodeConfig, type DRPNodeConfig, type LoggerOptions, Message } from "@ts-drp/types";
import { raceEvent } from "race-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

import rawConfig from "../../../configs/local-bootstrap.json" with { type: "json" };
import { DRPNetworkNode } from "../src/node.js";

describe("DRPNetworkNode can connect & send messages", () => {
	const controller = new AbortController();
	let node1: DRPNetworkNode;
	let node2: DRPNetworkNode;
	let libp2pNode1: Libp2p;
	let bootstrapNode: DRPNetworkNode;
	let pubsubNode1: GossipSub;

	const isDialable = async (node: DRPNetworkNode, timeout = false): Promise<boolean> => {
		let resolver: (value: boolean) => void;
		const promise = new Promise<boolean>((resolve) => {
			resolver = resolve;
		});

		if (timeout) {
			setTimeout(() => {
				resolver(false);
			}, 10);
		}

		const callback = (): void => {
			resolver(true);
		};

		await node.isDialable(callback);
		return promise;
	};

	beforeAll(async () => {
		const config: DRPNodeConfig = rawConfig;
		const bootstrapConfig: DRPNetworkNodeConfig = {
			...config.network_config,
			log_config: { level: "silent" },
		};
		bootstrapNode = new DRPNetworkNode(bootstrapConfig);
		await bootstrapNode.start();

		const bootstrapMultiaddrs = bootstrapNode.getMultiaddrs();
		const nodeConfig: DRPNetworkNodeConfig = {
			bootstrap_peers: bootstrapMultiaddrs,
			log_config: {
				level: "silent",
			},
		};
		node1 = new DRPNetworkNode({
			...nodeConfig,
		});
		node2 = new DRPNetworkNode({
			...nodeConfig,
		});

		await node1.start();
		const btLibp2pNode1 = bootstrapNode["_node"] as Libp2p;
		libp2pNode1 = node1["_node"] as Libp2p;
		await Promise.all([
			raceEvent(btLibp2pNode1, "peer:identify", controller.signal, {
				filter: (event: CustomEvent<IdentifyResult>) =>
					event.detail.peerId.equals(libp2pNode1.peerId) && event.detail.listenAddrs.length > 0,
			}),
			isDialable(node1),
		]);

		await node2.start();
		expect(await isDialable(node2)).toBe(true);
		pubsubNode1 = node1["_pubsub"] as GossipSub;
	});

	test("Node can send message to peer", async () => {
		const data = "Hello World!";
		let boolean = false;

		await raceEvent(libp2pNode1, "connection:open", controller.signal, {
			filter: (event: CustomEvent<Connection>) =>
				event.detail.remotePeer.toString() === node2.peerId && event.detail.limits === undefined,
		});

		const messageProcessed = new Promise((resolve) => {
			node2.subscribeToMessageQueue(async () => {
				await Promise.resolve();
				boolean = true;
				resolve(true);
			});
		});

		await node1.sendMessage(
			node2.peerId,
			Message.create({ sender: "", type: 0, data: new Uint8Array(Buffer.from(data)), objectId: "" })
		);

		await messageProcessed;
		expect(boolean).toBe(true);
	});

	test("Node can send message to group", async () => {
		const data = "Hello Group!";
		const group = "test";
		let boolean = false;

		const graftPromise = raceEvent(pubsubNode1, "gossipsub:graft", controller.signal, {
			filter: (event: CustomEvent<MeshPeer>) => event.detail.peerId === node2.peerId,
		});

		const subscriptionChange = new Promise((resolve) => {
			raceEvent(pubsubNode1, "subscription-change", controller.signal, {
				filter: (event: CustomEvent<SubscriptionChangeData>) =>
					event.detail.subscriptions.some((s) => s.topic === group) && event.detail.peerId.toString() === node2.peerId,
			})
				.then(() => resolve(true))
				.catch(() => resolve(false));
		});

		node2.subscribe(group);
		const messageProcessed = new Promise((resolve) => {
			node2.subscribeToMessageQueue(async () => {
				await Promise.resolve();
				boolean = true;
				resolve(true);
			});
		});

		await Promise.all([graftPromise, subscriptionChange]);
		await node1.broadcastMessage(
			group,
			Message.create({ sender: "", type: 0, data: new Uint8Array(Buffer.from(data)), objectId: "" })
		);
		await messageProcessed;

		expect(boolean).toBe(true);
	}, 10000);

	afterAll(async () => {
		await bootstrapNode.stop();
		await node1.stop();
		await node2.stop();
	});
});

describe("DRPNetworkNode safeDial", () => {
	const nodes: DRPNetworkNode[] = [];
	const logConfig: LoggerOptions = { level: "silent" };
	const defaultConfig: DRPNetworkNodeConfig = {
		listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws"],
		bootstrap_peers: [],
		log_config: logConfig,
	};

	const createNode = (): DRPNetworkNode => {
		const node = new DRPNetworkNode(defaultConfig);
		return node;
	};

	const createNodes = (count: number): DRPNetworkNode[] => {
		for (let i = 0; i < count; i++) {
			nodes.push(createNode());
		}
		return nodes;
	};

	beforeEach(async () => {
		if (nodes.length === 0) {
			createNodes(3);
		}
		await Promise.all(nodes.map((node) => node.start()));
	});

	afterEach(async () => {
		await Promise.all(nodes.map((node) => node.stop()));
	});

	test("should return a connection if the peerId is valid", async () => {
		console.log(nodes);
		const node = nodes[0];
		const conn = await node.safeDial(nodes[1].getMultiaddrs()[0]);
		expect(conn).toBeDefined();
	});

	test("should return undefined if the peerId is invalid", async () => {
		const node = nodes[0];
		await expect(node.safeDial("invalid")).rejects.toThrowError();
	});

	test("should return undefined if the multiaddr is invalid", async () => {
		const node = nodes[0];
		await expect(node.safeDial("invalid")).rejects.toThrowError();
	});

	test("should return a connection if the peerId is an array of valid strings", async () => {
		const node = nodes[0];
		const conn = await node.safeDial([nodes[1].getMultiaddrs()[0], nodes[2].getMultiaddrs()[0]]);
		expect(conn).toBeDefined();
	});
});
