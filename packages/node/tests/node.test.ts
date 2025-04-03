import { bls } from "@chainsafe/bls/herumi";
import { type Connection, type IdentifyResult, type Libp2p } from "@libp2p/interface";
import { SetDRP } from "@ts-drp/blueprints";
import { Logger } from "@ts-drp/logger";
import { DRPNetworkNode } from "@ts-drp/network";
import { DRPObject, ObjectACL } from "@ts-drp/object";
import { ACLGroup, type DRPNetworkNodeConfig, DrpType, Operation, Vertex } from "@ts-drp/types";
import { raceEvent } from "race-event";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { signFinalityVertices, signGeneratedVertices, verifyACLIncomingVertices } from "../src/handlers.js";
import { DRPNode } from "../src/index.js";
import { log } from "../src/logger.js";

describe("DPRNode with verify and sign signature", () => {
	let drpNode: DRPNode;
	beforeAll(async () => {
		drpNode = new DRPNode();
		await drpNode.start();
	});

	test("Node will not sign vertex if it is not the creator", async () => {
		const vertices = [
			Vertex.create({
				hash: "hash",
				peerId: "peerId",
				operation: Operation.create({ opType: "type", value: ["value"], drpType: DrpType.DRP }),
				dependencies: [],
				timestamp: Date.now(),
				signature: new Uint8Array(),
			}),
		];
		await signGeneratedVertices(drpNode, vertices);
		expect(vertices[0].signature.length).toBe(0);
	});

	test("Node will sign vertex if it is the creator", async () => {
		const vertices = [
			Vertex.create({
				hash: "hash",
				peerId: drpNode.networkNode.peerId,
				operation: Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
				dependencies: [],
				timestamp: Date.now(),
				signature: new Uint8Array(),
			}),
		];
		await signGeneratedVertices(drpNode, vertices);
		expect(vertices[0].signature).not.toBe("");
		expect(vertices[0].signature.length).toBe(65);
	});

	test("Verify incoming vertices", async () => {
		const vertices = [
			Vertex.create({
				hash: "hash",
				peerId: drpNode.networkNode.peerId,
				operation: Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
				dependencies: [],
				timestamp: Date.now(),
				signature: new Uint8Array(),
			}),
		];
		await signGeneratedVertices(drpNode, vertices);
		const verifiedVertices = verifyACLIncomingVertices(vertices);
		expect(verifiedVertices.length).toBe(1);
	});

	test("Ignore vertex if the signature is invalid", () => {
		const vertices = [
			Vertex.create({
				hash: "hash",
				peerId: drpNode.networkNode.peerId,
				operation: Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
				dependencies: [],
				timestamp: Date.now(),
				signature: new Uint8Array(),
			}),
		];
		const verifiedVertices = verifyACLIncomingVertices(vertices);
		expect(verifiedVertices.length).toBe(0);
	});
});

describe("DRPNode voting tests", () => {
	let nodeA: DRPNode;
	let nodeB: DRPNode;
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;

	beforeAll(async () => {
		nodeA = new DRPNode();
		nodeB = new DRPNode();
		await nodeA.start();
		await nodeB.start();
	});

	beforeEach(() => {
		const acl = new ObjectACL({
			admins: [nodeA.networkNode.peerId],
		});

		obj1 = new DRPObject({
			peerId: nodeA.networkNode.peerId,
			acl,
			drp: new SetDRP(),
		});
		obj1.acl.setKey(nodeA.keychain.blsPublicKey);

		obj2 = new DRPObject({
			peerId: nodeB.networkNode.peerId,
			acl: obj1.acl,
			drp: new SetDRP(),
		});
	});

	test("Nodes in writer set are able to sign", async () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:SETKEY ---- A:ADD(1)
		*/

		obj1.acl.grant(nodeB.networkNode.peerId, ACLGroup.Finality);

		await obj2.merge(obj1.vertices);
		obj2.acl.setKey(nodeB.keychain.blsPublicKey);

		await obj1.merge(obj2.vertices);
		obj1.drp?.add(1);

		await obj2.merge(obj1.vertices);
		const V1 = obj2.vertices.find((v) => v.operation?.value && v.operation?.value[0] === 1) as Vertex;
		expect(V1 !== undefined).toBe(true);

		signFinalityVertices(nodeB, obj2, [V1]);

		expect(obj2.finalityStore.canSign(nodeB.networkNode.peerId, V1.hash)).toBe(true);
		expect(obj2.finalityStore.getAttestation(V1.hash)?.signature).toEqual(nodeB.keychain.signWithBls(V1.hash));
		expect(obj2.finalityStore.getNumberOfSignatures(V1.hash)).toBe(1);
	});

	test("Other nodes are not able to sign", async () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:SETKEY ---- A:ADD(1) ---- A:REVOKE(B) ---- A:ADD(2)
		*/

		obj1.acl.grant(nodeB.networkNode.peerId, ACLGroup.Finality);

		await obj2.merge(obj1.vertices);
		obj2.acl.setKey(nodeB.keychain.blsPublicKey);

		await obj1.merge(obj2.vertices);
		obj1.drp?.add(1);
		obj1.acl.revoke(nodeB.networkNode.peerId, ACLGroup.Finality);
		obj1.drp?.add(2);

		await obj2.merge(obj1.vertices);
		const V2 = obj2.vertices.find((v) => v.operation?.value && v.operation?.value[0] === 2) as Vertex;
		expect(V2 !== undefined).toBe(true);

		signFinalityVertices(nodeB, obj2, [V2]);

		expect(obj2.finalityStore.canSign(nodeB.networkNode.peerId, V2.hash)).toBe(false);

		expect(obj2.finalityStore.getAttestation(V2.hash)?.signature).toBeUndefined();
		expect(obj2.finalityStore.getNumberOfSignatures(V2.hash)).toBe(0);
	});

	test("Signatures are aggregated", async () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:SETKEY ---- A:ADD(1)
		*/

		obj1.acl.grant(nodeB.networkNode.peerId, ACLGroup.Finality);

		await obj2.merge(obj1.vertices);
		obj2.acl.setKey(nodeB.keychain.blsPublicKey);

		await obj1.merge(obj2.vertices);
		obj1.drp?.add(1);

		await obj2.merge(obj1.vertices);
		const V1 = obj2.vertices.find((v) => v.operation?.value && v.operation?.value[0] === 1) as Vertex;
		expect(V1 !== undefined).toBe(true);

		signFinalityVertices(nodeA, obj2, [V1]);
		expect(obj2.finalityStore.getNumberOfSignatures(V1.hash)).toBe(1);

		signFinalityVertices(nodeB, obj2, [V1]);
		expect(obj2.finalityStore.getNumberOfSignatures(V1.hash)).toBe(2);
		expect(obj2.finalityStore.getAttestation(V1.hash)?.signature).toEqual(
			bls.aggregateSignatures([nodeA.keychain.signWithBls(V1.hash), nodeB.keychain.signWithBls(V1.hash)])
		);
	});
});

describe("DRPNode with rpc", () => {
	let drp: SetDRP<number>;
	let drpNode: DRPNode;
	let drpObject: DRPObject<SetDRP<number>>;
	let mockLogger: Logger;

	beforeAll(async () => {
		drpNode = new DRPNode();
		await drpNode.start();
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
		mockLogger = new Logger("drp::network", {});
	});
	beforeEach(() => {
		drp = new SetDRP();
		const acl = new ObjectACL({
			admins: [drpNode.networkNode.peerId],
		});
		drpObject = new DRPObject({ peerId: drpNode.networkNode.peerId, acl, drp });
		drpObject.acl.setKey(drpNode.keychain.blsPublicKey);
	});

	test("should run connectObject", async () => {
		vi.useRealTimers();
		const drpObjectConnected = await drpNode.connectObject({ id: drpObject.id, drp });
		expect(drpObjectConnected.id).toEqual(drpObject.id);
		const object = drpNode.get(drpObject.id);
		expect(object).toBeDefined();
	});

	test("should run unsubscribeObject", () => {
		drpNode.unsubscribeObject(drpObject.id);
		expect(mockLogger.info).toHaveBeenCalledWith("::unsubscribe: Successfuly unsubscribed the topic", drpObject.id);
	});

	test("should run unsubscribeObject with purge", () => {
		drpNode.unsubscribeObject(drpObject.id, true);
		const store = drpNode.get(drpObject.id);
		expect(store).toBeUndefined();
	});

	test("should run syncObject ", async () => {
		await drpNode.syncObject(drpObject.id);
	});

	test("should run node restart", async () => {
		await drpNode.restart();
		expect(mockLogger.info).toHaveBeenCalledWith("::restart: Node restarted");
	});
});

describe("DRPObject connection tests", () => {
	vi.setConfig({ testTimeout: 15000, hookTimeout: 15000 });
	const controller = new AbortController();
	let node1: DRPNode;
	let node2: DRPNode;
	let bootstrapNode: DRPNetworkNode;
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
	});

	afterAll(async () => {
		await bootstrapNode?.stop();
		await node1?.stop();
		await node2?.stop();
	});

	test("Node should able to connect object and fetch states", async () => {
		const obj1 = await node1.createObject({
			drp: new SetDRP<number>(),
			acl: new ObjectACL({
				admins: [node1.networkNode.peerId, "fake-peer"],
			}),
		});
		expect(obj1.acl.query_isAdmin(node1.networkNode.peerId)).toBe(true);

		const obj2 = await node2.connectObject({
			id: obj1.id,
			sync: {
				peerId: node1.networkNode.peerId,
			},
		});
		expect(obj2.acl).toBeDefined();
		expect(obj2.acl.query_isAdmin(node1.networkNode.peerId)).toBe(true);
		expect(obj2.acl.query_isAdmin("fake-peer")).toBe(true);
		expect(obj2.acl.query_isAdmin(node2.networkNode.peerId)).toBe(false);
	}, 20_000);

	test("Should error if the fetch state timeouts", async () => {
		const logSpy = vi.spyOn(log, "error").mockImplementation(() => {});
		await node1.connectObject({
			id: "fake-id",
			sync: {
				peerId: node2.networkNode.peerId,
			},
		});

		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("::connectObject: Fetch state timed out"));
		logSpy.mockRestore();
	});
});
