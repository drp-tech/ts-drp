import { ACLGroup, ActionType, DrpType } from "@ts-drp/types";
import { beforeEach, describe, expect, test } from "vitest";

import { ObjectACL } from "../src/acl/index.js";

describe("AccessControl tests with RevokeWins resolution", () => {
	let acl: ObjectACL;

	beforeEach(() => {
		acl = new ObjectACL({
			admins: new Map([
				[
					"peer1",
					{
						secp256k1PublicKey: "publicKey1",
						blsPublicKey: "publicKey1",
					},
				],
			]),
		});
	});

	test("Admin nodes should have admin privileges", () => {
		expect(acl.query_isAdmin("peer1")).toBe(true);
	});

	test("Admin nodes should have write permissions", () => {
		expect(acl.query_isWriter("peer1")).toBe(true);
	});

	test("Grant write permissions to a new writer", () => {
		acl.grant("peer1", "peer3", ACLGroup.Writer, {
			secp256k1PublicKey: "publicKey3",
			blsPublicKey: "publicKey3",
		});

		expect(acl.query_isWriter("peer3")).toBe(true);
	});

	test("Should grant admin permission to a new admin", () => {
		const newAdmin = "newAdmin";
		acl.grant("peer1", newAdmin, ACLGroup.Admin, {
			secp256k1PublicKey: "newAdmin",
			blsPublicKey: "newAdmin",
		});
		expect(acl.query_isAdmin(newAdmin)).toBe(true);
	});

	test("Should grant finality permission to a new finality", () => {
		const newFinality = "newFinality";
		acl.grant("peer1", newFinality, ACLGroup.Finality, {
			secp256k1PublicKey: "newFinality",
			blsPublicKey: "newFinality",
		});
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
		acl.grant(
			"peer1",
			"peer3",

			ACLGroup.Writer,
			{
				secp256k1PublicKey: "publicKey3",
				blsPublicKey: "publicKey3",
			}
		);
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
			admins: new Map([
				[
					"peer1",
					{
						secp256k1PublicKey: "publicKey1",
						blsPublicKey: "publicKey1",
					},
				],
			]),
			permissionless: true,
		});
	});

	test("Admin nodes should have admin privileges", () => {
		expect(acl.query_isAdmin("peer1")).toBe(true);
	});

	test("Should admin cannot grant write permissions", () => {
		expect(() => {
			acl.grant("peer1", "peer3", ACLGroup.Writer, {
				secp256k1PublicKey: "publicKey3",
				blsPublicKey: "publicKey3",
			});
		}).toThrow("Cannot grant write permissions to a peer in permissionless mode.");
	});
});
