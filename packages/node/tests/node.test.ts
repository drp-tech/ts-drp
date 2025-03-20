import { bls } from "@chainsafe/bls/herumi";
import { SetDRP } from "@ts-drp/blueprints";
import { Logger } from "@ts-drp/logger";
import { DRPObject, ObjectACL } from "@ts-drp/object";
import { ACLGroup, DrpType, type Vertex } from "@ts-drp/types";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { signFinalityVertices, signGeneratedVertices, verifyACLIncomingVertices } from "../src/handlers.js";
import { DRPNode } from "../src/index.js";

describe("DPRNode with verify and sign signature", () => {
	let drpNode: DRPNode;
	beforeAll(async () => {
		drpNode = new DRPNode();
		await drpNode.start();
	});

	test("Node will not sign vertex if it is not the creator", async () => {
		const vertices = [
			{
				hash: "hash",
				peerId: "peerId",
				operation: {
					opType: "type",
					value: ["value"],
					drpType: DrpType.DRP,
				},
				dependencies: [],
				timestamp: Date.now(),
				signature: new Uint8Array(),
			},
		];
		await signGeneratedVertices(drpNode, vertices);
		expect(vertices[0].signature.length).toBe(0);
	});

	test("Node will sign vertex if it is the creator", async () => {
		const vertices = [
			{
				hash: "hash",
				peerId: drpNode.networkNode.peerId,
				operation: {
					opType: "add",
					value: [1],
					drpType: DrpType.DRP,
				},
				dependencies: [],
				timestamp: Date.now(),
				signature: new Uint8Array(),
			},
		];
		await signGeneratedVertices(drpNode, vertices);
		expect(vertices[0].signature).not.toBe("");
		expect(vertices[0].signature.length).toBe(65);
	});

	test("Verify incoming vertices", async () => {
		const vertices = [
			{
				hash: "hash",
				peerId: drpNode.networkNode.peerId,
				operation: {
					opType: "add",
					value: [1],
					drpType: DrpType.DRP,
				},
				dependencies: [],
				timestamp: Date.now(),
				signature: new Uint8Array(),
			},
		];
		await signGeneratedVertices(drpNode, vertices);
		const verifiedVertices = verifyACLIncomingVertices(vertices);
		expect(verifiedVertices.length).toBe(1);
	});

	test("Ignore vertex if the signature is invalid", () => {
		const vertices = [
			{
				hash: "hash",
				peerId: drpNode.networkNode.peerId,
				operation: {
					opType: "add",
					value: [1],
					drpType: DrpType.DRP,
				},
				dependencies: [],
				timestamp: Date.now(),
				signature: new Uint8Array(),
			},
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
		  ROOT -- A:GRANT(B) ---- B:ADD(1)
		*/

		obj1.acl.grant(nodeB.networkNode.peerId, ACLGroup.Finality);
		obj1.drp?.add(1);

		await obj2.merge(obj1.vertices);
		obj2.acl.setKey(nodeB.keychain.blsPublicKey);

		const V1 = obj2.vertices.find((v) => v.operation?.value !== null && v.operation?.value[0] === 1) as Vertex;
		expect(V1 !== undefined).toBe(true);

		signFinalityVertices(nodeB, obj2, [V1]);

		expect(obj2.finalityStore.canSign(nodeB.networkNode.peerId, V1.hash)).toBe(true);
		expect(obj2.finalityStore.getAttestation(V1.hash)?.signature).toEqual(nodeB.keychain.signWithBls(V1.hash));
		expect(obj2.finalityStore.getNumberOfSignatures(V1.hash)).toBe(1);
	});

	test("Other nodes are not able to sign", async () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:ADD(1) ---- A:REVOKE(B) ---- B:ADD(2)
		*/

		obj1.acl.grant(nodeB.networkNode.peerId, ACLGroup.Writer);
		obj1.drp?.add(1);
		obj1.acl.revoke(nodeB.networkNode.peerId, ACLGroup.Writer);
		obj1.drp?.add(2);

		await obj2.merge(obj1.vertices);
		const V2 = obj2.vertices.find((v) => v.operation?.value !== null && v.operation?.value[0] === 2) as Vertex;
		expect(V2 !== undefined).toBe(true);

		signFinalityVertices(nodeB, obj2, [V2]);

		expect(obj2.finalityStore.canSign(nodeB.networkNode.peerId, V2.hash)).toBe(false);

		expect(obj2.finalityStore.getAttestation(V2.hash)?.signature).toBeUndefined();
		expect(obj2.finalityStore.getNumberOfSignatures(V2.hash)).toBe(0);
	});

	test("Signatures are aggregated", async () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:ADD(1)
		*/

		obj1.acl.grant(nodeB.networkNode.peerId, ACLGroup.Finality);
		obj1.drp?.add(1);
		await obj2.merge(obj1.vertices);
		const V1 = obj2.vertices.find((v) => v.operation?.value !== null && v.operation?.value[0] === 1) as Vertex;
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
		const drpObjectConnected = await drpNode.connectObject({ id: drpObject.id, drp });
		expect(drpObjectConnected.id).toEqual(drpObject.id);
		vi.advanceTimersByTime(5000);
		const object = drpNode.objectStore.get(drpObject.id);
		expect(object).toBeDefined();
	});

	test("should run unsubscribeObject", () => {
		drpNode.unsubscribeObject(drpObject.id);
		expect(mockLogger.info).toHaveBeenCalledWith("::unsubscribe: Successfuly unsubscribed the topic", drpObject.id);
	});

	test("should run unsubscribeObject with purge", () => {
		drpNode.unsubscribeObject(drpObject.id, true);
		const store = drpNode.objectStore.get(drpObject.id);
		expect(store).toBeUndefined();
	});

	test("should run syncObject ", async () => {
		await drpNode.syncObject(drpObject.id);
	});

	test("should run node restart", async () => {
		await drpNode.restart();
		expect(mockLogger.info).toHaveBeenCalledWith("::restart: Node restarted");
	});

	test("Should subscribe to object", () => {
		drpNode.objectStore.subscribe(drpObject.id, () => {
			mockLogger.info("::subscribe: Subscribed to object");
		});
		const _subscriptions = drpNode.objectStore["_subscriptions"];
		expect(_subscriptions.has(drpObject.id)).toBe(true);
	});

	test("Should unsubscribe to object", () => {
		const callBack = (): void => {
			mockLogger.info("::unsubscribe: Unsubscribed to object");
		};
		drpNode.objectStore.subscribe(drpObject.id, callBack);
		drpNode.objectStore.unsubscribe(drpObject.id, callBack);
		const _subscriptions = drpNode.objectStore["_subscriptions"];
		const expectedCallback = _subscriptions.get(drpObject.id)?.find((x) => x === callBack);
		expect(expectedCallback).toBeUndefined();
	});
});
