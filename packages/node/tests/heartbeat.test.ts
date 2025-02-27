import { GossipSub, MeshPeer } from "@chainsafe/libp2p-gossipsub";
import { MapDRP } from "@ts-drp/blueprints";
import { DRP_DISCOVERY_TOPIC } from "@ts-drp/network/src/node.js";
import { raceEvent } from "race-event";
import { expect, describe, test, afterEach, beforeEach, vi } from "vitest";

import { DRPNode, DRPNodeConfig } from "../src/index.js";

describe("Heartbeat test", () => {
	let node1: DRPNode;
	let node2: DRPNode;
	let node3: DRPNode;

	beforeEach(async () => {
		const nodeConfig: DRPNodeConfig = {
			network_config: {
				listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws"],
				private_key_seed: "topic_discovery_peer_1",
				bootstrap_peers: [],
				pubsub: {
					peer_discovery_interval: 100_000_000,
				},
				log_config: {
					level: "silent",
				},
			},
			heartbeat_config: {
				interval: 1000,
				log_config: {
					level: "silent",
				},
			},
			log_config: {
				level: "silent",
			},
		};

		node1 = new DRPNode({
			...nodeConfig,
			network_config: {
				...nodeConfig.network_config,
				private_key_seed: "topic_discovery_peer_1",
			},
			heartbeat_config: {
				...nodeConfig.heartbeat_config,
				interval: 500,
				search_duration: 1000,
			},
		});

		node2 = new DRPNode({
			...nodeConfig,
			network_config: {
				...nodeConfig.network_config,
				private_key_seed: "topic_discovery_peer_2",
			},
		});

		node3 = new DRPNode({
			...nodeConfig,
			network_config: {
				...nodeConfig.network_config,
				private_key_seed: "topic_discovery_peer_3",
			},
		});

		await Promise.all([node1.start(), node2.start(), node3.start()]);
	});

	afterEach(async () => {
		await Promise.all([node1.stop(), node2.stop(), node3.stop()]);
		vi.clearAllMocks();
	});

	test("peer 1 can discover peer 3 topic", async () => {
		const node2GossipSub = node2.networkNode["_pubsub"] as GossipSub;

		const filterGraft = (topic: string, peerId: string) => (e: CustomEvent<MeshPeer>) =>
			e.detail.topic === topic && e.detail.peerId.toString() === peerId;

		const node2MA = node2.networkNode.getMultiaddrs();
		if (!node2MA) throw new Error("No multiaddrs");

		await Promise.all([
			node1.networkNode.connect(node2MA),
			node3.networkNode.connect(node2MA),
			raceEvent(node2GossipSub, "gossipsub:graft", undefined, {
				filter: filterGraft(DRP_DISCOVERY_TOPIC, node1.networkNode.peerId),
			}),
			raceEvent(node2GossipSub, "gossipsub:graft", undefined, {
				filter: filterGraft(DRP_DISCOVERY_TOPIC, node3.networkNode.peerId),
			}),
		]);
		const drp = new MapDRP();
		const drpObject = await node1.createObject({
			drp: drp,
			id: "test_topic_discovery",
		});

		await node3.connectObject({
			id: drpObject.id,
		});

		const node3GossipSub = node3.networkNode["_pubsub"] as GossipSub;
		await raceEvent(node3GossipSub, "gossipsub:graft", undefined, {
			filter: (e: CustomEvent<MeshPeer>) => e.detail.topic === drpObject.id,
		});

		expect(node3.networkNode.getGroupPeers(drpObject.id).length).toBe(1);
		expect(node3.networkNode.getGroupPeers(drpObject.id)[0]).toBe(node1.networkNode.peerId);
		expect(node1.networkNode.getGroupPeers(drpObject.id).length).toBe(1);
		expect(node1.networkNode.getGroupPeers(drpObject.id)[0]).toBe(node3.networkNode.peerId);
	});

	test("peer 1 can't hearbeat stop searching after 1 seconds", async () => {
		// Add mock logger
		vi.mock("@ts-drp/logger", () => {
			const mockLogger = {
				error: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
			};

			return {
				Logger: vi.fn().mockImplementation(() => mockLogger),
			};
		});

		const drp = new MapDRP();
		await node1.createObject({
			drp: drp,
			id: "test_heartbeat_timeout",
		});

		await new Promise((resolve) => setTimeout(resolve, 2100));

		// Get the logger instance
		// @ts-expect-error - logger is private
		const loggerInstance = node1.heartbeat?.["logger"];

		// Verify error was logged
		expect(loggerInstance.error).toHaveBeenCalledWith(
			"::heartbeat: No peers found after 1000ms of searching"
		);
	});
});
