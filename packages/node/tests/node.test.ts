import { bls } from "@chainsafe/bls/herumi";
import { SetDRP } from "@ts-drp/blueprints";
import { Logger } from "@ts-drp/logger";
import { DRPObject, ObjectACL } from "@ts-drp/object";
import { ACLGroup, DrpType, type IDRP, type Vertex } from "@ts-drp/types";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import {
	signFinalityVertices,
	signGeneratedVertices,
	verifyACLIncomingVertices,
} from "../src/handlers.js";
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
		const verifiedVertices = await verifyACLIncomingVertices(vertices);
		expect(verifiedVertices.length).toBe(1);
	});

	test("Ignore vertex if the signature is invalid", async () => {
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
		const verifiedVertices = await verifyACLIncomingVertices(vertices);
		expect(verifiedVertices.length).toBe(0);
	});
});

describe("DRPNode voting tests", () => {
	let drp1: SetDRP<number>;
	let acl1: ObjectACL;
	let nodeA: DRPNode;
	let nodeB: DRPNode;
	let obj1: DRPObject;
	let obj2: DRPObject;

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

		acl.setKey(
			nodeA.networkNode.peerId,
			nodeA.networkNode.peerId,
			nodeA.keychain.getPublicCredential()
		);
		acl.setKey(
			nodeB.networkNode.peerId,
			nodeB.networkNode.peerId,
			nodeB.keychain.getPublicCredential()
		);
		obj1 = new DRPObject({
			peerId: nodeA.networkNode.peerId,
			acl,
			drp: new SetDRP(),
		});
		drp1 = obj1.drp as SetDRP<number>;
		acl1 = obj1.acl as ObjectACL;
		obj2 = new DRPObject({
			peerId: nodeB.networkNode.peerId,
			acl: acl1,
			drp: new SetDRP(),
		});
	});

	test("Nodes in writer set are able to sign", () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:ADD(1)
		*/

		acl1.grant(nodeA.networkNode.peerId, nodeB.networkNode.peerId, ACLGroup.Finality);
		drp1.add(1);

		obj2.merge(obj1.vertices);
		const V1 = obj2.vertices.find(
			(v) => v.operation?.value !== null && v.operation?.value[0] === 1
		) as Vertex;
		expect(V1 !== undefined).toBe(true);

		signFinalityVertices(nodeB, obj2, [V1]);

		expect(obj2.finalityStore.canSign(nodeB.networkNode.peerId, V1.hash)).toBe(true);
		expect(obj2.finalityStore.getAttestation(V1.hash)?.signature).toEqual(
			nodeB.keychain.signWithBls(V1.hash)
		);
		expect(obj2.finalityStore.getNumberOfSignatures(V1.hash)).toBe(1);
	});

	test("Other nodes are not able to sign", () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:ADD(1) ---- A:REVOKE(B) ---- B:ADD(2)
		*/

		acl1.grant(nodeA.networkNode.peerId, nodeB.networkNode.peerId, ACLGroup.Writer);
		drp1.add(1);
		acl1.revoke(nodeA.networkNode.peerId, nodeB.networkNode.peerId, ACLGroup.Writer);
		drp1.add(2);

		obj2.merge(obj1.vertices);
		const V2 = obj2.vertices.find(
			(v) => v.operation?.value !== null && v.operation?.value[0] === 2
		) as Vertex;
		expect(V2 !== undefined).toBe(true);

		signFinalityVertices(nodeB, obj2, [V2]);

		expect(obj2.finalityStore.canSign(nodeB.networkNode.peerId, V2.hash)).toBe(false);

		expect(obj2.finalityStore.getAttestation(V2.hash)?.signature).toBeUndefined();
		expect(obj2.finalityStore.getNumberOfSignatures(V2.hash)).toBe(0);
	});

	test("Signatures are aggregated", () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:ADD(1)
		*/

		acl1.grant(nodeA.networkNode.peerId, nodeB.networkNode.peerId, ACLGroup.Finality);
		drp1.add(1);
		obj2.merge(obj1.vertices);
		const V1 = obj2.vertices.find(
			(v) => v.operation?.value !== null && v.operation?.value[0] === 1
		) as Vertex;
		expect(V1 !== undefined).toBe(true);

		signFinalityVertices(nodeA, obj2, [V1]);
		expect(obj2.finalityStore.getNumberOfSignatures(V1.hash)).toBe(1);

		signFinalityVertices(nodeB, obj2, [V1]);
		expect(obj2.finalityStore.getNumberOfSignatures(V1.hash)).toBe(2);
		expect(obj2.finalityStore.getAttestation(V1.hash)?.signature).toEqual(
			bls.aggregateSignatures([
				nodeA.keychain.signWithBls(V1.hash),
				nodeB.keychain.signWithBls(V1.hash),
			])
		);
	});
});

describe("DRPNode with rpc", () => {
	let drp: IDRP;
	let drpNode: DRPNode;
	let drpObject: DRPObject;
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
		acl.setKey(
			drpNode.networkNode.peerId,
			drpNode.networkNode.peerId,
			drpNode.keychain.getPublicCredential()
		);
		drpObject = new DRPObject({ peerId: drpNode.networkNode.peerId, acl, drp });
	});

	test("should run connectObject", async () => {
		const drpObjectConnected = await drpNode.connectObject({ id: drpObject.id, drp });
		expect(drpObjectConnected.id).toEqual(drpObject.id);
		vi.advanceTimersByTime(3000);
		const object = drpNode.objectStore.get(drpObject.id);
		expect(object).toBeDefined();
	});

	test("should run unsubscribeObject", () => {
		drpNode.unsubscribeObject(drpObject.id);
		expect(mockLogger.info).toHaveBeenCalledWith(
			"::unsubscribe: Successfuly unsubscribed the topic",
			drpObject.id
		);
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
