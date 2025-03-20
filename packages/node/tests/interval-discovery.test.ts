import { type GossipSub, type MeshPeer } from "@chainsafe/libp2p-gossipsub";
import { MapDRP } from "@ts-drp/blueprints";
import { DRPNode } from "@ts-drp/node";
import { DRP_INTERVAL_DISCOVERY_TOPIC, type DRPNodeConfig } from "@ts-drp/types";
import { raceEvent } from "race-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("Heartbeat integration test", () => {
	let node1: DRPNode;
	let node2: DRPNode;
	let node3: DRPNode;

	beforeEach(async () => {
		const nodeConfig: DRPNodeConfig = {
			network_config: {
				listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws"],
				bootstrap_peers: [],
				pubsub: {
					peer_discovery_interval: 100_000_000,
				},
				log_config: {
					level: "silent",
				},
			},
			keychain_config: {
				private_key_seed: "topic_discovery_peer_1",
			},
			interval_discovery_options: {
				interval: 1000,
				logConfig: {
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
			},
			keychain_config: {
				private_key_seed: "topic_discovery_peer_1",
			},
			interval_discovery_options: {
				...nodeConfig.interval_discovery_options,
				interval: 500,
				searchDuration: 1000,
			},
		});

		node2 = new DRPNode({
			...nodeConfig,
			network_config: {
				...nodeConfig.network_config,
			},
			keychain_config: {
				private_key_seed: "topic_discovery_peer_2",
			},
		});

		node3 = new DRPNode({
			...nodeConfig,
			network_config: {
				...nodeConfig.network_config,
			},
			keychain_config: {
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

		const filterGraft =
			(topic: string, peerId: string): ((e: CustomEvent<MeshPeer>) => boolean) =>
			(e: CustomEvent<MeshPeer>) =>
				e.detail.topic === topic && e.detail.peerId.toString() === peerId;

		const node2MA = node2.networkNode.getMultiaddrs();
		if (!node2MA) throw new Error("No multiaddrs");

		await Promise.all([
			node1.networkNode.connect(node2MA),
			node3.networkNode.connect(node2MA),
			raceEvent(node2GossipSub, "gossipsub:graft", undefined, {
				filter: filterGraft(DRP_INTERVAL_DISCOVERY_TOPIC, node1.networkNode.peerId),
			}),
			raceEvent(node2GossipSub, "gossipsub:graft", undefined, {
				filter: filterGraft(DRP_INTERVAL_DISCOVERY_TOPIC, node3.networkNode.peerId),
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
		const node1GossipSub = node1.networkNode["_pubsub"] as GossipSub;
		await Promise.all([
			raceEvent(node3GossipSub, "gossipsub:graft", undefined, {
				filter: (e: CustomEvent<MeshPeer>) => e.detail.topic === drpObject.id,
			}),
			raceEvent(node1GossipSub, "gossipsub:graft", undefined, {
				filter: (e: CustomEvent<MeshPeer>) => e.detail.topic === drpObject.id,
			}),
		]);

		expect(node3.networkNode.getGroupPeers(drpObject.id).length).toBe(1);
		expect(node3.networkNode.getGroupPeers(drpObject.id)[0]).toBe(node1.networkNode.peerId);
		expect(node1.networkNode.getGroupPeers(drpObject.id).length).toBe(1);
		expect(node1.networkNode.getGroupPeers(drpObject.id)[0]).toBe(node3.networkNode.peerId);
	});

	test("peer 1 can't heartbeat stop searching after 1 seconds", async () => {
		// Add mock logger
		vi.useFakeTimers();
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
		const id = "test_heartbeat_timeout";
		await node1.createObject({
			drp: drp,
			id,
		});

		vi.advanceTimersByTime(1000);
		await new Promise(process.nextTick);
		vi.advanceTimersByTime(1000);

		// Access internal logger safely with proper type assertion
		const interval = node1["_intervals"].get(id);
		type LoggerType = { error(message: string): void };

		// First cast to unknown, then to the specific type
		const loggerInstance = interval ? (interval as unknown as { _logger: LoggerType })["_logger"] : undefined;

		if (loggerInstance) {
			expect(loggerInstance.error).toHaveBeenCalledWith("No peers found after 1000ms of searching");
		} else {
			throw new Error("Logger instance should not be null");
		}

		vi.useRealTimers();
	});
});
