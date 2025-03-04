import { bls } from "@chainsafe/bls/herumi";
import { SetDRP } from "@ts-drp/blueprints";
import { ACLGroup, ObjectACL } from "@ts-drp/object";
import { type DRP, DRPObject, DrpType } from "@ts-drp/object";
import { type Vertex } from "@ts-drp/types";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import {
	signFinalityVertices,
	signGeneratedVertices,
	verifyACLIncomingVertices,
} from "../src/handlers.js";
import { DRPNode } from "../src/index.js";

describe("DPRNode with verify and sign signature", () => {
	let drp: DRP;
	let drpNode: DRPNode;
	let drpObject: DRPObject;
	beforeAll(async () => {
		drpNode = new DRPNode();
		await drpNode.start();
	});

	beforeEach(async () => {
		drp = new SetDRP();
		const acl = new ObjectACL({
			admins: new Map([[drpNode.networkNode.peerId, drpNode.keychain.getPublicCredential()]]),
		});
		drpObject = new DRPObject({ peerId: drpNode.networkNode.peerId, acl, drp });
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
		const verifiedVertices = await verifyACLIncomingVertices(drpObject, vertices);
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
		const verifiedVertices = await verifyACLIncomingVertices(drpObject, vertices);
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

	beforeEach(async () => {
		const acl = new ObjectACL({
			admins: new Map([[nodeA.networkNode.peerId, nodeA.keychain.getPublicCredential()]]),
		});

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

	test("Nodes in writer set are able to sign", async () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:ADD(1)
		*/

		acl1.grant(
			nodeA.networkNode.peerId,
			nodeB.networkNode.peerId,
			ACLGroup.Finality,
			nodeB.keychain.getPublicCredential()
		);
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

	test("Other nodes are not able to sign", async () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:ADD(1) ---- A:REVOKE(B) ---- B:ADD(2)
		*/

		acl1.grant(
			nodeA.networkNode.peerId,
			nodeB.networkNode.peerId,
			ACLGroup.Writer,
			nodeB.keychain.getPublicCredential()
		);
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

	test("Signatures are aggregated", async () => {
		/*
		  ROOT -- A:GRANT(B) ---- B:ADD(1)
		*/

		acl1.grant(
			nodeA.networkNode.peerId,
			nodeB.networkNode.peerId,
			ACLGroup.Finality,
			nodeB.keychain.getPublicCredential()
		);
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
