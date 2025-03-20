import type { Connection, IdentifyResult, Libp2p, Stream } from "@libp2p/interface";
import { SetDRP } from "@ts-drp/blueprints";
import { DRPNetworkNode, type DRPNetworkNodeConfig } from "@ts-drp/network";
import { type DRPObject, ObjectACL } from "@ts-drp/object";
import { DrpType, FetchState, type IACL, Message, MessageType } from "@ts-drp/types";
import { raceEvent } from "race-event";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { drpMessagesHandler, signGeneratedVertices } from "../src/handlers.js";
import { DRPNode } from "../src/index.js";

describe("drpMessagesHandler inputs", () => {
	let node: DRPNode;
	const consoleSpy = vi.spyOn(console, "error");

	beforeAll(() => {
		node = new DRPNode();
	});

	test("normal inputs", async () => {
		await drpMessagesHandler(node);
		expect(consoleSpy).toHaveBeenLastCalledWith("drp::node ::messageHandler: Stream and data are undefined");

		const msg = Message.create({
			sender: node.networkNode.peerId,
			type: -1,
			data: new Uint8Array(),
		});
		await drpMessagesHandler(node, undefined, msg.data);
		expect(consoleSpy).toHaveBeenLastCalledWith("drp::node ::messageHandler: Invalid operation");

		await drpMessagesHandler(
			node,
			{
				close: async () => {},
				closeRead: async () => {},
				closeWrite: async () => {},
			} as Stream,
			undefined
		);
		expect(consoleSpy).toHaveBeenLastCalledWith(
			"drp::node ::messageHandler: Error decoding message",
			new Error("Empty pipeline")
		);
	});
});

describe("Handle message correctly", () => {
	const controller = new AbortController();
	let node1: DRPNode;
	let node2: DRPNode;
	let bootstrapNode: DRPNetworkNode;
	let drpObjectNode2: DRPObject<SetDRP<number>>;
	let libp2pNode2: Libp2p;
	let libp2pNode1: Libp2p;
	let acl: IACL;

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
		acl = new ObjectACL({
			admins: [node1.networkNode.peerId, node2.networkNode.peerId],
		});
		acl.setKey(node1.networkNode.peerId, node1.networkNode.peerId, node1.keychain.blsPublicKey);
		acl.setKey(node2.networkNode.peerId, node2.networkNode.peerId, node2.keychain.blsPublicKey);
		drpObjectNode2 = await node2.createObject({
			drp: new SetDRP<number>(),
			acl: acl,
		});
		await node1.createObject({
			drp: new SetDRP<number>(),
			id: drpObjectNode2.id,
			acl: acl,
		});
	});

	test("should handle update message correctly", async () => {
		drpObjectNode2.drp?.add(5);
		drpObjectNode2.drp?.add(10);
		const vertices = drpObjectNode2.vertices;
		await signGeneratedVertices(node2, vertices);
		await new Promise((resolve) => setTimeout(resolve, 500));
		const expected_vertices = node1.objectStore.get(drpObjectNode2.id)?.vertices.map((vertex) => {
			return vertex.operation;
		});
		expect(expected_vertices).toStrictEqual([
			{ drpType: "", opType: "-1", value: null },
			{ opType: "add", value: [5], drpType: DrpType.DRP },
			{ opType: "add", value: [10], drpType: DrpType.DRP },
		]);
	});

	test("should handle fetch state", async () => {
		(drpObjectNode2.drp as SetDRP<number>).add(5);
		(drpObjectNode2.drp as SetDRP<number>).add(10);
		const message = Message.create({
			sender: node1.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_FETCH_STATE,
			data: FetchState.encode(
				FetchState.create({
					objectId: drpObjectNode2.id,
					vertexHash: drpObjectNode2.vertices[0].hash,
				})
			).finish(),
		});

		await node1.networkNode.sendMessage(node2.networkNode.peerId, message);
		await new Promise((resolve) => setTimeout(resolve, 2000));
		const drp = node1.objectStore.get(drpObjectNode2.id);
		const drp2 = node2.objectStore.get(drpObjectNode2.id);
		// After fetching the state, the vertices should be the same
		expect(drp?.vertices.length).toEqual(drp2?.vertices.length);
	});

	test("should handle sync message correctly", async () => {
		(drpObjectNode2.drp as SetDRP<number>).add(5);
		(drpObjectNode2.drp as SetDRP<number>).add(10);
		await new Promise((resolve) => setTimeout(resolve, 500));
		const node1DrpObject = node1.objectStore.get(drpObjectNode2.id);
		expect(node1DrpObject).toBeDefined();

		node1DrpObject?.drp?.add(1);
		node1DrpObject?.drp?.add(2);

		await new Promise((resolve) => setTimeout(resolve, 500));

		expect(drpObjectNode2.vertices.length).toBe(5);
		expect(node1DrpObject?.vertices.length).toBe(5);

		const node3 = createNewNode("node3");

		await node3.start();
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(node3.objectStore.get(drpObjectNode2.id)?.vertices.length).toBe(undefined);
		await node3.connectObject({
			id: drpObjectNode2.id,
			sync: {
				peerId: node2.networkNode.peerId,
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));
		expect(node3.objectStore.get(drpObjectNode2.id)?.vertices.length).toBe(5);
	}, 20000);

	test("should handle update attestation message correctly", async () => {
		(drpObjectNode2.drp as SetDRP<number>).add(5);
		(drpObjectNode2.drp as SetDRP<number>).add(10);
		const hash = drpObjectNode2.vertices[1].hash;
		(drpObjectNode2.drp as SetDRP<number>).add(6);
		expect(node2.objectStore.get(drpObjectNode2.id)?.finalityStore.getNumberOfSignatures(hash)).toBe(1);
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(node2.objectStore.get(drpObjectNode2.id)?.finalityStore.getNumberOfSignatures(hash)).toBe(2);
	});

	afterAll(async () => {
		await bootstrapNode.stop();
		await node1.networkNode.stop();
		await node2.networkNode.stop();
	});
});
