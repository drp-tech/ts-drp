import { Keychain } from "@ts-drp/keychain";
import { beforeAll, describe, expect, test } from "vitest";

import { DRPNetworkNode } from "../src/node.js";

describe("isDialable", () => {
	let btNode: DRPNetworkNode;
	let keychain: Keychain;
	beforeAll(async () => {
		keychain = new Keychain({
			private_key_seed: "bootstrap_is_dialable",
		});
		await keychain.start();
		btNode = new DRPNetworkNode({
			bootstrap: true,
			listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws"],
			bootstrap_peers: [],
		});
		await btNode.start(keychain.secp256k1PrivateKey);
	});

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

	test("should return true if the node is dialable", async () => {
		const keychain1 = new Keychain({
			private_key_seed: "is_dialable_node_1",
		});
		await keychain1.start();
		const node = new DRPNetworkNode({
			bootstrap_peers: btNode.getMultiaddrs()?.map((addr) => addr.toString()) || [],
		});
		await node.start(keychain1.secp256k1PrivateKey);
		expect(await isDialable(node)).toBe(true);
	});

	test("should return false if the node is not dialable", async () => {
		const keychain2 = new Keychain({
			private_key_seed: "is_dialable_node_2",
		});
		await keychain2.start();
		const node = new DRPNetworkNode({
			bootstrap_peers: btNode.getMultiaddrs()?.map((addr) => addr.toString()) || [],
			listen_addresses: [],
		});
		await node.start(keychain2.secp256k1PrivateKey);
		expect(await isDialable(node, true)).toBe(false);
	});
});
