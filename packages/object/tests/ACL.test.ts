import { ACLGroup, ActionType, DrpType } from "@ts-drp/types";
import { beforeEach, describe, expect, test } from "vitest";

import { ObjectACL } from "../src/acl/index.js";

describe("AccessControl tests with RevokeWins resolution", () => {
	let acl: ObjectACL;

	beforeEach(() => {
		acl = new ObjectACL({
			admins: ["peer1"],
		});
	});

	test("Admin nodes should have admin privileges", () => {
		expect(acl.query_isAdmin("peer1")).toBe(true);
	});

	test("Admin nodes should have write permissions", () => {
		expect(acl.query_isWriter("peer1")).toBe(true);
	});

	test("Grant write permissions to a new writer", () => {
		acl.grant("peer1", "peer3", ACLGroup.Writer);

		expect(acl.query_isWriter("peer3")).toBe(true);
	});

	test("Should grant admin permission to a new admin", () => {
		const newAdmin = "newAdmin";
		acl.grant("peer1", newAdmin, ACLGroup.Admin);
		expect(acl.query_isAdmin(newAdmin)).toBe(true);
	});

	test("Nodes should not able to setKey for another node", () => {
		expect(() => {
			acl.setKey("peer1", "peer2", "blsPublicKey1");
		}).toThrowError("Cannot set key for another peer.");
	});

	test("Nodes without finality permissions should not be able to setKey", () => {
		expect(() => {
			acl.setKey("peer2", "peer2", "blsPublicKey2");
		}).toThrowError("Only finality signers can set their BLS public key.");
	});

	test("Nodes should be able to setKey for themselves", () => {
		acl.setKey("peer1", "peer1", "blsPublicKey1");
		expect(acl.query_getPeerKey("peer1")).toStrictEqual("blsPublicKey1");
	});

	test("Should be able to setKey after grant", () => {
		acl.grant("peer1", "peer2", ACLGroup.Finality);
		acl.grant("peer1", "peer2", ACLGroup.Writer);
		expect(acl.query_isWriter("peer2")).toBe(true);
		expect(acl.query_getPeerKey("peer2")).toStrictEqual("");

		acl.setKey("peer2", "peer2", "blsPublicKey2");
		expect(acl.query_isWriter("peer2")).toBe(true);
		expect(acl.query_getPeerKey("peer2")).toStrictEqual("blsPublicKey2");
	});

	test("Should be able to setKey before grant", () => {
		acl.grant("peer1", "peer2", ACLGroup.Finality);
		acl.setKey("peer2", "peer2", "blsPublicKey2");
		expect(acl.query_isWriter("peer2")).toBe(false);
		expect(acl.query_getPeerKey("peer2")).toStrictEqual("blsPublicKey2");

		acl.grant("peer1", "peer2", ACLGroup.Writer);
		expect(acl.query_isWriter("peer2")).toBe(true);
		expect(acl.query_getPeerKey("peer2")).toStrictEqual("blsPublicKey2");
	});

	test("Resolve conflicts with setKey operation should always return ActionType.Nop", () => {
		const vertex1 = {
			hash: "",
			peerId: "peer1",
			operation: { opType: "setKey", value: [], drpType: DrpType.ACL },
			dependencies: [],
			signature: new Uint8Array(),
			timestamp: 0,
		};

		const vertex2 = {
			hash: "",
			peerId: "peer2",
			operation: { opType: "revoke", value: [], drpType: DrpType.ACL },
			dependencies: [],
			signature: new Uint8Array(),
			timestamp: 0,
		};

		expect(acl.resolveConflicts([vertex1, vertex2]).action).toBe(ActionType.Nop);
		expect(acl.resolveConflicts([vertex2, vertex1]).action).toBe(ActionType.Nop);
	});

	test("Should grant finality permission to a new finality", () => {
		const newFinality = "newFinality";
		acl.grant("peer1", newFinality, ACLGroup.Finality);
		expect(acl.query_isFinalitySigner(newFinality)).toBe(true);
	});

	test("Should cannot revoke admin permissions", () => {
		expect(() => {
			acl.revoke("peer1", "peer1", ACLGroup.Admin);
		}).toThrow("Cannot revoke permissions from a peer with admin privileges.");

		expect(acl.query_isAdmin("peer1")).toBe(true);
	});

	test("Should revoke finality permissions", () => {
		const newFinality = "newFinality";
		acl.revoke("peer1", newFinality, ACLGroup.Finality);
		expect(acl.query_isFinalitySigner(newFinality)).toBe(false);
	});

	test("Revoke write permissions from a writer", () => {
		acl.grant("peer1", "peer3", ACLGroup.Writer);
		acl.revoke("peer1", "peer3", ACLGroup.Writer);

		expect(acl.query_isWriter("peer3")).toBe(false);
	});

	test("Cannot revoke admin permissions", () => {
		expect(() => {
			acl.revoke("peer1", "peer1", ACLGroup.Writer);
		}).toThrow("Cannot revoke permissions from a peer with admin privileges.");

		expect(acl.query_isWriter("peer1")).toBe(true);
	});

	test("Resolve conflicts with RevokeWins", () => {
		const vertices = [
			{
				hash: "",
				peerId: "peer1",
				operation: { opType: "grant", value: "peer3", drpType: DrpType.ACL },
				dependencies: [],
				signature: new Uint8Array(),
				timestamp: 0,
			},
			{
				hash: "",
				peerId: "peer2",
				operation: { opType: "revoke", value: "peer3", drpType: DrpType.ACL },
				dependencies: [],
				signature: new Uint8Array(),
				timestamp: 0,
			},
		];
		const result = acl.resolveConflicts(vertices);
		expect(result.action).toBe(ActionType.DropLeft);
	});
});

describe("AccessControl tests with permissionless", () => {
	let acl: ObjectACL;

	beforeEach(() => {
		acl = new ObjectACL({
			admins: ["peer1"],
			permissionless: true,
		});
	});

	test("Admin nodes should have admin privileges", () => {
		expect(acl.query_isAdmin("peer1")).toBe(true);
	});

	test("Should admin cannot grant write permissions", () => {
		expect(() => {
			acl.grant("peer1", "peer3", ACLGroup.Writer);
		}).toThrow("Cannot grant write permissions to a peer in permissionless mode.");
	});

	test("Should not update other admin permissions", () => {
		const acl1 = new ObjectACL({
			admins: ["peer1", "peer2"],
			permissionless: true,
		});

		acl1.permissionless = false;
		expect(acl1.query_isWriter("peer1")).toBe(false);
		expect(acl1.query_isWriter("peer2")).toBe(false);

		acl1.grant("peer1", "peer2", ACLGroup.Writer);
		expect(acl1.query_isWriter("peer1")).toBe(false);
		expect(acl1.query_isWriter("peer2")).toBe(true);
	});
});
