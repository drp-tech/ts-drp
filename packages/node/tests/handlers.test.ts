import type { Connection, IdentifyResult, Libp2p } from "@libp2p/interface";
import { SetDRP } from "@ts-drp/blueprints";
import { DRPNetworkNode } from "@ts-drp/network";
import { type DRPObject, ObjectACL } from "@ts-drp/object";
import { type DRPNetworkNodeConfig, DrpType, NodeEventName, type ObjectId, Operation } from "@ts-drp/types";
import { raceEvent } from "race-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DRPNode } from "../src/index.js";

describe("Handle message correctly", () => {
	vi.setConfig({
		testTimeout: 20000,
		hookTimeout: 20000,
	});
	const controller = new AbortController();
	let node1: DRPNode;
	let node2: DRPNode;
	let bootstrapNode: DRPNetworkNode;
	let drpObjectNode1: DRPObject<SetDRP<number>>;
	let drpObjectNode2: DRPObject<SetDRP<number>>;
	let libp2pNode2: Libp2p;
	let libp2pNode1: Libp2p;

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

	const createNewNode = (privateKeySeed: string): DRPNode => {
		const bootstrapMultiaddrs = bootstrapNode.getMultiaddrs();
		const nodeConfig: DRPNetworkNodeConfig = {
			bootstrap_peers: bootstrapMultiaddrs,
			log_config: {
				level: "silent",
			},
		};
		return new DRPNode({
			network_config: nodeConfig,
			keychain_config: {
				private_key_seed: privateKeySeed,
			},
		});
	};

	beforeEach(async () => {
		bootstrapNode = new DRPNetworkNode({
			bootstrap: true,
			listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws"],
			bootstrap_peers: [],
		});
		await bootstrapNode.start();

		node1 = createNewNode("node1");
		node2 = createNewNode("node2");

		await node2.start();
		const btLibp2pNode1 = bootstrapNode["_node"] as Libp2p;
		libp2pNode2 = node2.networkNode["_node"] as Libp2p;

		await Promise.all([
			raceEvent(btLibp2pNode1, "peer:identify", controller.signal, {
				filter: (event: CustomEvent<IdentifyResult>) =>
					event.detail.peerId.equals(libp2pNode2.peerId) && event.detail.listenAddrs.length > 0,
			}),
			isDialable(node2.networkNode),
		]);

		await node1.start();
		expect(await isDialable(node1.networkNode)).toBe(true);

		libp2pNode1 = node1.networkNode["_node"] as Libp2p;

		await Promise.all([
			raceEvent(libp2pNode2, "connection:open", controller.signal, {
				filter: (event: CustomEvent<Connection>) =>
					event.detail.remotePeer.toString() === node1.networkNode.peerId && event.detail.limits === undefined,
			}),
			raceEvent(libp2pNode1, "connection:open", controller.signal, {
				filter: (event: CustomEvent<Connection>) =>
					event.detail.remotePeer.toString() === node2.networkNode.peerId && event.detail.limits === undefined,
			}),
		]);

		const acl = new ObjectACL({ admins: [node1.networkNode.peerId, node2.networkNode.peerId] });
		acl.context = {
			caller: node1.networkNode.peerId,
		};
		acl.setKey(node1.keychain.blsPublicKey);

		acl.context = {
			caller: node2.networkNode.peerId,
		};
		acl.setKey(node2.keychain.blsPublicKey);

		drpObjectNode2 = await node2.createObject({
			drp: new SetDRP<number>(),
			acl,
		});
		drpObjectNode1 = await node1.createObject({
			drp: new SetDRP<number>(),
			acl,
			id: drpObjectNode2.id,
		});
	});

	afterEach(async () => {
		await bootstrapNode.stop();
		await node1.networkNode.stop();
		await node2.networkNode.stop();
	});

	test("should handle update message correctly", async () => {
		const p = raceEvent(node1, NodeEventName.DRP_UPDATE, controller.signal, {
			filter: (event: CustomEvent<ObjectId>) => event.detail.id === drpObjectNode2.id,
		});

		drpObjectNode2.drp?.add(5);

		await p;
		const expected_operations = node1.get(drpObjectNode2.id)?.vertices.map((vertex) => {
			return vertex.operation;
		});
		expect(expected_operations).toStrictEqual([
			Operation.create({ drpType: "", opType: "-1" }),
			Operation.create({ opType: "add", value: [5], drpType: DrpType.DRP }),
		]);
	});

	test("should handle sync and fetch message correctly", async () => {
		const p = raceEvent(node1, NodeEventName.DRP_UPDATE);
		drpObjectNode2.drp?.add(5);
		await p;
		const p2 = raceEvent(node1, NodeEventName.DRP_UPDATE);
		drpObjectNode2.drp?.add(10);
		await p2;
		expect(drpObjectNode1).toBeDefined();
		const p3 = raceEvent(node2, NodeEventName.DRP_UPDATE);
		drpObjectNode1?.drp?.add(1);
		await p3;
		const p4 = raceEvent(node2, NodeEventName.DRP_UPDATE);
		drpObjectNode1?.drp?.add(2);
		await p4;
		expect(drpObjectNode1?.vertices.length).toBe(5);
		expect(drpObjectNode2.vertices.length).toBe(5);
		const node3 = createNewNode("node3");

		await node3.start();

		const libp2pNode3 = node3.networkNode["_node"] as Libp2p;
		await raceEvent(libp2pNode3, "connection:open", controller.signal, {
			filter: (event: CustomEvent<Connection>) =>
				event.detail.remotePeer.toString() === node2.networkNode.peerId && event.detail.limits === undefined,
		});

		expect(node3.get(drpObjectNode2.id)?.vertices.length).toBe(undefined);
		const p6 = raceEvent(node3, NodeEventName.DRP_FETCH_STATE_RESPONSE, controller.signal);
		const p7 = raceEvent(node3, NodeEventName.DRP_SYNC_ACCEPTED, controller.signal);
		const p5 = raceEvent(node2, NodeEventName.DRP_FETCH_STATE);

		await Promise.all([
			node3.connectObject({
				id: drpObjectNode2.id,
				sync: {
					peerId: node2.networkNode.peerId,
				},
			}),
			p5,
			p6,
			p7,
		]);
		expect(node3.get(drpObjectNode2.id)?.vertices.length).toBe(5);
	});

	test("should handle update attestation message correctly", async () => {
		const p = raceEvent(node2, NodeEventName.DRP_ATTESTATION_UPDATE, controller.signal, {
			filter: (event: CustomEvent<ObjectId>) => event.detail.id === drpObjectNode2.id,
		});
		drpObjectNode2.drp?.add(5);

		const hash = drpObjectNode2.vertices[1].hash;
		expect(node2.get(drpObjectNode2.id)?.finalityStore.getNumberOfSignatures(hash)).toBe(1);

		await p;
		expect(node2.get(drpObjectNode2.id)?.finalityStore.getNumberOfSignatures(hash)).toBe(2);
	});
});
