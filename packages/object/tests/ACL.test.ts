import { ACLGroup, ActionType, DrpType, type IACL, Operation, Vertex } from "@ts-drp/types";
import { beforeEach, describe, expect, test } from "vitest";

import { createACL, createPermissionlessACL } from "../src/index.js";

describe("AccessControl tests with RevokeWins resolution", () => {
	let acl: IACL;

	beforeEach(() => {
		acl = createACL({ admins: ["peer1"] });
	});

	test("Admin nodes should have admin privileges", () => {
		expect(acl.query_isAdmin("peer1")).toBe(true);
	});

	test("Admin nodes should have write permissions", () => {
		expect(acl.query_isWriter("peer1")).toBe(true);
	});

	test("Grant write permissions to a new writer", () => {
		acl.context = { caller: "peer1" };
		acl.grant("peer3", ACLGroup.Writer);

		expect(acl.query_isWriter("peer3")).toBe(true);
	});

	test("Should grant admin permission to a new admin", () => {
		const newAdmin = "newAdmin";
		acl.context = { caller: "peer1" };
		acl.grant(newAdmin, ACLGroup.Admin);
		expect(acl.query_isAdmin(newAdmin)).toBe(true);
	});

	test("Nodes without finality permissions should not be able to setKey", () => {
		acl.context = { caller: "peer2" };
		expect(() => {
			acl.setKey("blsPublicKey2");
		}).toThrowError("Only finality signers can set their BLS public key.");
	});

	test("Nodes should be able to setKey for themselves", () => {
		acl.context = { caller: "peer1" };
		acl.setKey("blsPublicKey1");
		expect(acl.query_getPeerKey("peer1")).toStrictEqual("blsPublicKey1");
	});

	test("Should be able to setKey after grant", () => {
		acl.context = { caller: "peer1" };
		acl.grant("peer2", ACLGroup.Finality);
		acl.grant("peer2", ACLGroup.Writer);
		expect(acl.query_isWriter("peer2")).toBe(true);
		expect(acl.query_getPeerKey("peer2")).toStrictEqual("");

		acl.context = { caller: "peer2" };
		acl.setKey("blsPublicKey2");
		expect(acl.query_isWriter("peer2")).toBe(true);
		expect(acl.query_getPeerKey("peer2")).toStrictEqual("blsPublicKey2");
	});

	test("Should be able to setKey before grant", () => {
		acl.context = { caller: "peer1" };
		acl.grant("peer2", ACLGroup.Finality);
		acl.context = { caller: "peer2" };
		acl.setKey("blsPublicKey2");
		expect(acl.query_isWriter("peer2")).toBe(false);
		expect(acl.query_getPeerKey("peer2")).toStrictEqual("blsPublicKey2");

		acl.context = { caller: "peer1" };
		acl.grant("peer2", ACLGroup.Writer);
		expect(acl.query_isWriter("peer2")).toBe(true);
		expect(acl.query_getPeerKey("peer2")).toStrictEqual("blsPublicKey2");
	});

	test("Resolve conflicts with setKey operation should always return ActionType.Nop", () => {
		const vertex1 = Vertex.create({
			hash: "",
			peerId: "peer1",
			operation: Operation.create({ opType: "setKey", value: [], drpType: DrpType.ACL }),
			dependencies: [],
			signature: new Uint8Array(),
			timestamp: 0,
		});

		const vertex2 = Vertex.create({
			hash: "",
			peerId: "peer2",
			operation: Operation.create({ opType: "revoke", value: [], drpType: DrpType.ACL }),
			dependencies: [],
			signature: new Uint8Array(),
			timestamp: 0,
		});

		expect(acl.resolveConflicts?.([vertex1, vertex2]).action).toBe(ActionType.Nop);
		expect(acl.resolveConflicts?.([vertex2, vertex1]).action).toBe(ActionType.Nop);
	});

	test("Should grant finality permission to a new finality", () => {
		acl.context = { caller: "peer1" };
		const newFinality = "newFinality";
		acl.grant(newFinality, ACLGroup.Finality);
		expect(acl.query_isFinalitySigner(newFinality)).toBe(true);
	});

	test("Should cannot revoke admin permissions", () => {
		acl.context = { caller: "peer1" };
		expect(() => {
			acl.revoke("peer1", ACLGroup.Admin);
		}).toThrow("Cannot revoke permissions from a peer with admin privileges.");

		expect(acl.query_isAdmin("peer1")).toBe(true);
	});

	test("Should revoke finality permissions", () => {
		acl.context = { caller: "peer1" };
		const newFinality = "newFinality";
		acl.revoke(newFinality, ACLGroup.Finality);
		expect(acl.query_isFinalitySigner(newFinality)).toBe(false);
	});

	test("Revoke write permissions from a writer", () => {
		acl.context = { caller: "peer1" };
		acl.grant("peer3", ACLGroup.Writer);
		acl.context = { caller: "peer1" };
		acl.revoke("peer3", ACLGroup.Writer);

		expect(acl.query_isWriter("peer3")).toBe(false);
	});

	test("Cannot revoke admin permissions", () => {
		acl.context = { caller: "peer1" };
		expect(() => {
			acl.revoke("peer1", ACLGroup.Writer);
		}).toThrow("Cannot revoke permissions from a peer with admin privileges.");

		expect(acl.query_isWriter("peer1")).toBe(true);
	});

	test("Resolve conflicts with RevokeWins", () => {
		const vertices = [
			Vertex.create({
				hash: "",
				peerId: "peer1",
				operation: Operation.create({ opType: "grant", value: "peer3", drpType: DrpType.ACL }),
				dependencies: [],
				signature: new Uint8Array(),
				timestamp: 0,
			}),
			Vertex.create({
				hash: "",
				peerId: "peer2",
				operation: Operation.create({ opType: "revoke", value: "peer3", drpType: DrpType.ACL }),
				dependencies: [],
				signature: new Uint8Array(),
				timestamp: 0,
			}),
		];
		const result = acl.resolveConflicts?.(vertices);
		expect(result?.action).toBe(ActionType.DropLeft);
	});
});

describe("AccessControl tests with permissionless", () => {
	test.concurrent("Admin nodes should have admin privileges", () => {
		const acl = createPermissionlessACL(["peer1"]);
		expect(acl.query_isAdmin("peer1")).toBe(true);
	});

	test.concurrent("Admin should not grant write permissions", () => {
		const acl = createPermissionlessACL(["peer1"]);
		acl.context = { caller: "peer1" };
		expect(() => {
			acl.grant("peer3", ACLGroup.Writer);
		}).toThrow("Cannot grant write permissions to a peer in permissionless mode.");
	});

	test.concurrent("Should not update other admin permissions", () => {
		const acl = createPermissionlessACL(["peer1", "peer2"]);

		acl.permissionless = false;
		expect(acl.query_isWriter("peer1")).toBe(false);
		expect(acl.query_isWriter("peer2")).toBe(false);

		acl.context = { caller: "peer1" };
		acl.grant("peer2", ACLGroup.Writer);
		expect(acl.query_isWriter("peer1")).toBe(false);
		expect(acl.query_isWriter("peer2")).toBe(true);
	});
});
