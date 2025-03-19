import { type Libp2p, type Libp2pEvents, type PeerId } from "@libp2p/interface";
import { peerIdFromString } from "@libp2p/peer-id";
import { Keychain } from "@ts-drp/keychain";
import { DRPNetworkNode } from "@ts-drp/network";
import { DRPNode } from "@ts-drp/node";
import { type DRPNodeConfig, type LoggerOptions } from "@ts-drp/types";
import { promisify } from "util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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

describe("Reconnect test", () => {
	let bootstrapNode: DRPNetworkNode;
	let node: DRPNode;

	beforeEach(async () => {
		const keychain = new Keychain({
			private_key_seed: "bt_node",
		});
		await keychain.start();
		bootstrapNode = new DRPNetworkNode({
			bootstrap: true,
			listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws"],
			bootstrap_peers: [],
		});
		await bootstrapNode.start(keychain.secp256k1PrivateKey);
		const bootstrapMultiaddrs = bootstrapNode.getMultiaddrs();

		const logConfig: LoggerOptions = {
			level: "silent",
		};

		const nodeConfig: DRPNodeConfig = {
			network_config: {
				bootstrap_peers: bootstrapMultiaddrs,
				pubsub: {
					peer_discovery_interval: 100_000_000,
				},
				log_config: logConfig,
			},
			keychain_config: {
				private_key_seed: "topic_reconnect_peer_1",
			},
			interval_reconnect_options: {
				interval: 1000,
				logConfig: logConfig,
			},
			log_config: logConfig,
		};
		node = new DRPNode({
			...nodeConfig,
			network_config: {
				...nodeConfig.network_config,
			},
			interval_reconnect_options: {
				...nodeConfig.interval_reconnect_options,
				interval: 500,
			},
		});

		const btLibp2p = bootstrapNode["_node"] as Libp2p;
		await Promise.all([
			node.start(),
			promisify(waitForLibp2pEvent)(
				btLibp2p,
				"peer:identify",
				(event) =>
					event.detail.peerId.toString() === node.networkNode.peerId &&
					event.detail.listenAddrs.length > 0
			),
		]);
	});

	afterEach(async () => {
		await Promise.all([node.stop(), bootstrapNode.stop()]);
		vi.clearAllMocks();
	});

	test("Disconnect from bootstrap", async () => {
		const btLibp2p = bootstrapNode["_node"] as Libp2p;
		const nodeLibp2p = node.networkNode["_node"] as Libp2p;
		await nodeLibp2p.peerStore.save(peerIdFromString(btLibp2p.peerId.toString()), { tags: {} });
		await btLibp2p.peerStore.save(peerIdFromString(nodeLibp2p.peerId.toString()), { tags: {} });
		const p = promisify(waitForLibp2pEvent);
		const pIDMatcher = (peerIdStr: string, peerId: PeerId): boolean =>
			peerId.toString() === peerIdStr;

		await Promise.all([
			node.networkNode.disconnect(bootstrapNode.peerId),
			bootstrapNode.disconnect(node.networkNode.peerId),
			p(nodeLibp2p, "peer:disconnect", (event) => pIDMatcher(bootstrapNode.peerId, event.detail)),
			p(btLibp2p, "peer:disconnect", (event) => pIDMatcher(node.networkNode.peerId, event.detail)),
		]);

		await Promise.all([
			p(
				btLibp2p,
				"connection:open",
				(event) =>
					pIDMatcher(node.networkNode.peerId, event.detail.remotePeer) &&
					event.detail.limits == null
			),
			p(
				nodeLibp2p,
				"connection:open",
				(event) =>
					pIDMatcher(bootstrapNode.peerId, event.detail.remotePeer) && event.detail.limits == null
			),
		]);

		expect(node.networkNode.getAllPeers().length).toBeGreaterThan(0);
		expect(bootstrapNode.getAllPeers().length).toBeGreaterThan(0);
	});
});
