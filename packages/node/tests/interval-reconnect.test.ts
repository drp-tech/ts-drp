import { multiaddr } from "@multiformats/multiaddr";
import { DRPNetworkNode } from "@ts-drp/network";
import { DRPNode } from "@ts-drp/node";
import { type DRPNodeConfig } from "@ts-drp/types";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("Reconnect test", () => {
	let bootstrapNode: DRPNetworkNode;
	let node: DRPNode;

	beforeEach(async () => {
		bootstrapNode = new DRPNetworkNode({
			bootstrap: true,
			listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws"],
			bootstrap_peers: [],
		});
		await bootstrapNode.start();
		const bootstrapMultiaddrs = bootstrapNode.getMultiaddrs();

		const nodeConfig: DRPNodeConfig = {
			network_config: {
				listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws"],
				bootstrap_peers: bootstrapMultiaddrs,
				pubsub: {
					peer_discovery_interval: 100_000_000,
				},
				log_config: {
					level: "silent",
				},
			},
			keychain_config: {
				private_key_seed: "topic_reconnect_peer_1",
			},
			interval_reconnect_options: {
				interval: 1000,
				logConfig: {
					level: "silent",
				},
			},
			log_config: {
				level: "silent",
			},
		};
		node = new DRPNode({
			...nodeConfig,
			network_config: {
				...nodeConfig.network_config,
			},
			keychain_config: {
				private_key_seed: "topic_reconnect_peer_1",
			},
			interval_reconnect_options: {
				...nodeConfig.interval_reconnect_options,
				interval: 500,
			},
		});

		await Promise.all([node.start()]);
	});

	afterEach(async () => {
		await Promise.all([node.stop(), bootstrapNode.stop()]);
		vi.clearAllMocks();
	});

	test("Disconnect from bootstrap", async () => {
		const address = bootstrapNode.getMultiaddrs();
		for (const addr of address) {
			const peerId = multiaddr(addr).getPeerId();
			if (peerId === null) continue;
			await node.networkNode.disconnect(peerId);
		}
		expect(node.networkNode.getAllPeers().length).toBe(0);

		// Wait for reconnect
		await new Promise((resolve) => setTimeout(resolve, 2000));

		expect(node.networkNode.getAllPeers().length).toBeGreaterThan(0);
	});
});
