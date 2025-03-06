import { SetDRP } from "@ts-drp/blueprints";
import {
	type IDRP,
	type Vertex,
	ActionType,
	SemanticsType,
	type ResolveConflictsType,
} from "@ts-drp/types";
import { beforeEach, describe, expect, it, test, vi } from "vitest";

import { DRPObject, ObjectACL } from "../src/index.js";

const acl = new ObjectACL({
	admins: new Map([
		["peer1", { secp256k1PublicKey: "pubKey1", blsPublicKey: "pubKey1" }],
		["peer2", { secp256k1PublicKey: "pubKey2", blsPublicKey: "pubKey2" }],
		["peer3", { secp256k1PublicKey: "pubKey3", blsPublicKey: "pubKey3" }],
	]),
});

describe("AccessControl tests with RevokeWins resolution", () => {
	beforeEach(() => {});

	test("Test creating DRPObject wo/ ACL and publicCred", () => {
		expect(() => new DRPObject({ peerId: "" })).toThrow(
			"Either publicCredential or acl must be provided to create a DRPObject"
		);
	});

	test("Test creating DRPObject w/ publicCred", () => {
		const cred = {
			secp256k1PublicKey: "cred",
			blsPublicKey: "cred",
		};
		const obj = new DRPObject({ peerId: "", publicCredential: cred });
		expect(obj.acl).toBeDefined();
	});

	test("Test creating an object wo/ DRP", () => {
		const obj = DRPObject.createObject({ peerId: "" });
		expect(obj.drp).toBeUndefined();
	});
});

describe("Drp Object should be able to change state value", () => {
	let drpObject: DRPObject;

	beforeEach(() => {
		drpObject = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
	});

	it("should update ACL state keys when DRP state changes", () => {
		const drpSet = drpObject.drp as SetDRP<number>;
		const aclInstance = drpObject.acl as ObjectACL;

		// Add a value to the DRP set
		drpSet.add(1);

		// Get the ACL states and expected variable names
		const aclStates = drpObject.aclStates.values();
		const expectedKeys = Object.keys(aclInstance);

		// Check that each state contains the expected keys
		for (const state of aclStates) {
			const stateKeys = state.state.map((x) => x.key);
			expect(stateKeys).toEqual(expectedKeys);
		}

		const drpStates = drpObject.drpStates.values();
		const expectedDrpKeys = Object.keys(drpSet);

		// Check that each state contains the expected keys
		for (const state of drpStates) {
			const stateKeys = state.state.map((x) => x.key);
			expect(stateKeys).toEqual(expectedDrpKeys);
		}
	});
});

describe("Test for duplicate call issue", () => {
	let counter = 0;

	class CounterDRP implements IDRP {
		semanticsType = SemanticsType.pair;

		private _counter: number;

		constructor() {
			this._counter = 0;
		}

		test(): number {
			this._counter++;
			counter++;
			return this._counter;
		}

		resolveConflicts(_: Vertex[]): ResolveConflictsType {
			return { action: ActionType.Nop };
		}
	}

	test("Detect duplicate call", () => {
		const obj = new DRPObject({
			peerId: "",
			publicCredential: {
				secp256k1PublicKey: "cred",
				blsPublicKey: "cred",
			},
			drp: new CounterDRP(),
		});

		const testDRP = obj.drp as CounterDRP;
		expect(testDRP).toBeDefined();
		const ret = testDRP.test();
		expect(ret).toBe(counter);
	});
});

describe("Merging vertices tests", () => {
	let obj1: DRPObject;
	let obj2: DRPObject;

	beforeEach(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
	});

	test("Test: merge should skip unknown dependencies", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 19)));
		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		drp2.add(2);
		obj1.merge(obj2.hashGraph.getAllVertices());
		drp1.add(3);

		const vertex = obj1.vertices.find(
			(v) => v.operation?.opType === "add" && v.operation.value[0] === 3
		);
		if (!vertex) {
			throw new Error("Vertex not found");
		}
		expect(obj2.merge([vertex])).toEqual([
			false,
			["e5ef52c6186abe51635619df8bc8676c19f5a6519e40f47072683437255f026a"],
		]);
	});
});
