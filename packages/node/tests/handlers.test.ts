import type { Connection, IdentifyResult, Libp2p, Stream } from "@libp2p/interface";
import { SetDRP } from "@ts-drp/blueprints";
import { DRPNetworkNode, type DRPNetworkNodeConfig } from "@ts-drp/network";
import { type DRPObject, ObjectACL } from "@ts-drp/object";
import {
	AttestationUpdate,
	DrpType,
	FetchState,
	Message,
	MessageType,
	Sync,
	SyncAccept,
	Update,
} from "@ts-drp/types";
import { raceEvent } from "race-event";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

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
		expect(consoleSpy).toHaveBeenLastCalledWith(
			"drp::node ::messageHandler: Stream and data are undefined"
		);

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
	let drpObject: DRPObject;
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

	beforeAll(async () => {
		bootstrapNode = new DRPNetworkNode({
			bootstrap: true,
			listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws"],
			bootstrap_peers: [],
		});
		await bootstrapNode.start();

		const bootstrapMultiaddrs = bootstrapNode.getMultiaddrs();
		const nodeConfig: DRPNetworkNodeConfig = {
			bootstrap_peers: bootstrapMultiaddrs,
			log_config: {
				level: "silent",
			},
		};
		node1 = new DRPNode({
			network_config: nodeConfig,
			keychain_config: {
				private_key_seed: "node1",
			},
		});
		node2 = new DRPNode({
			network_config: nodeConfig,
			keychain_config: {
				private_key_seed: "node2",
			},
		});

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
					event.detail.remotePeer.toString() === node1.networkNode.peerId &&
					event.detail.limits === undefined,
			}),
			raceEvent(libp2pNode1, "connection:open", controller.signal, {
				filter: (event: CustomEvent<Connection>) =>
					event.detail.remotePeer.toString() === node2.networkNode.peerId &&
					event.detail.limits === undefined,
			}),
		]);
	});

	test("should handle update message correctly", async () => {
		const acl = new ObjectACL({
			admins: [node1.networkNode.peerId, node2.networkNode.peerId],
		});
		acl.setKey(node1.networkNode.peerId, node1.networkNode.peerId, node1.keychain.blsPublicKey);
		acl.setKey(node2.networkNode.peerId, node2.networkNode.peerId, node2.keychain.blsPublicKey);
		drpObject = await node2.createObject({
			drp: new SetDRP<number>(),
			acl: acl,
		});
		await node1.createObject({
			drp: new SetDRP<number>(),
			id: drpObject.id,
			acl: acl,
		});

		(drpObject.drp as SetDRP<number>).add(5);
		(drpObject.drp as SetDRP<number>).add(10);

		const vertices = drpObject.vertices;
		await signGeneratedVertices(node2, vertices);
		const message = Message.create({
			sender: node2.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_UPDATE,
			data: Update.encode(
				Update.create({
					objectId: drpObject.id,
					vertices: vertices,
				})
			).finish(),
		});
		await node2.networkNode.sendMessage(node1.networkNode.peerId, message);
		await new Promise((resolve) => setTimeout(resolve, 500));
		const expected_vertices = node1.objectStore.get(drpObject.id)?.vertices.map((vertex) => {
			return vertex.operation;
		});
		expect(expected_vertices).toStrictEqual([
			{ drpType: "", opType: "-1", value: null },
			{ opType: "add", value: [5], drpType: DrpType.DRP },
			{ opType: "add", value: [10], drpType: DrpType.DRP },
		]);
	});

	test("should handle fetch state", async () => {
		const message = Message.create({
			sender: node1.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_FETCH_STATE,
			data: FetchState.encode(
				FetchState.create({
					objectId: drpObject.id,
					vertexHash: drpObject.vertices[0].hash,
				})
			).finish(),
		});

		await node1.networkNode.sendMessage(node2.networkNode.peerId, message);
		await new Promise((resolve) => setTimeout(resolve, 1000));
		const drp = node1.objectStore.get(drpObject.id);
		const drp2 = node2.objectStore.get(drpObject.id);
		// After fetching the state, the vertices should be the same
		expect(drp?.vertices.length).toEqual(drp2?.vertices.length);
	});

	test("should handle sync message correctly", async () => {
		const node1DrpObject = node1.objectStore.get(drpObject.id);
		expect(node1DrpObject).toBeDefined();

		(node1DrpObject?.drp as SetDRP<number>).add(1);
		(node1DrpObject?.drp as SetDRP<number>).add(2);

		expect(drpObject.vertices.length).toBe(3);
		expect(node1DrpObject?.vertices.length).toBe(5);

		const message = Message.create({
			sender: node1.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_SYNC,
			data: Sync.encode(
				Sync.create({
					objectId: drpObject.id,
					vertexHashes: node1.objectStore.get(drpObject.id)?.vertices.map((vertex) => vertex.hash),
				})
			).finish(),
		});

		await node1.networkNode.sendMessage(node2.networkNode.peerId, message);
		await new Promise((resolve) => setTimeout(resolve, 500));

		// auto sync accept
		expect(drpObject.vertices.length).toBe(5);
	});

	test("should handle sync accept message correctly", async () => {
		const node1DrpObject = node1.objectStore.get(drpObject.id);
		expect(node1DrpObject).toBeDefined();
		(node1DrpObject?.drp as SetDRP<number>).add(3);
		(node1DrpObject?.drp as SetDRP<number>).add(20);
		expect(node1DrpObject?.vertices.length).toBe(7);
		await signGeneratedVertices(node1, node1DrpObject?.vertices || []);
		const message = Message.create({
			sender: node1.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_SYNC_ACCEPT,
			data: SyncAccept.encode(
				SyncAccept.create({
					objectId: drpObject.id,
					requested: node1DrpObject?.vertices,
					requesting: [],
					attestations: [],
				})
			).finish(),
		});
		await node1.networkNode.sendMessage(node2.networkNode.peerId, message);
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(node1.objectStore.get(drpObject.id)?.vertices.length).toBe(7);
		expect(drpObject.vertices.length).toBe(7);
	});

	test("should handle update attestation message correctly", async () => {
		const hash = drpObject.vertices[1].hash;
		expect(node2.objectStore.get(drpObject.id)?.finalityStore.getNumberOfSignatures(hash)).toBe(2);
		const attestations = node1.objectStore.get(drpObject.id)?.vertices.map((vertex) => {
			return {
				data: vertex.hash,
				signature: node1.keychain.signWithBls(vertex.hash),
			};
		});
		const message = Message.create({
			sender: node1.networkNode.peerId,
			type: MessageType.MESSAGE_TYPE_ATTESTATION_UPDATE,
			data: AttestationUpdate.encode(
				AttestationUpdate.create({
					objectId: drpObject.id,
					attestations,
				})
			).finish(),
		});
		await node1.networkNode.sendMessage(node2.networkNode.peerId, message);
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(node2.objectStore.get(drpObject.id)?.finalityStore.getNumberOfSignatures(hash)).toBe(2);
	});

	afterAll(async () => {
		await bootstrapNode.stop();
		await node1.networkNode.stop();
		await node2.networkNode.stop();
	});
});
