import { SetDRP } from "@ts-drp/blueprints";
import { AsyncCounterDRP } from "@ts-drp/test-utils";
import {
	ActionType,
	type DrpRuntimeContext,
	type IDRP,
	type ResolveConflictsType,
	SemanticsType,
	type Vertex,
} from "@ts-drp/types";
import { beforeEach, describe, expect, it, test, vi } from "vitest";

import { DRPObject, ObjectACL } from "../src/index.js";

const acl = new ObjectACL({
	admins: ["peer1", "peer2", "peer3"],
});

describe("AccessControl tests with RevokeWins resolution", () => {
	beforeEach(() => {});

	test("Test creating DRPObject wo/ ACL", () => {
		const obj = new DRPObject({ peerId: "" });
		expect(obj.acl).toBeDefined();
	});

	test("Test creating an object wo/ DRP", () => {
		const obj = DRPObject.createObject({ peerId: "" });
		expect(obj).toBeDefined();
	});
});

describe("Drp Object should be able to change state value", () => {
	let drpObject: DRPObject<SetDRP<number>>;

	beforeEach(() => {
		drpObject = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
	});

	it("should update ACL state keys when DRP state changes", () => {
		// Add a value to the DRP set
		drpObject.drp?.add(1);

		// Get the ACL states and expected variable names
		const aclStates = drpObject.aclStates.values();
		const expectedKeys = Object.keys(drpObject.acl);

		// Check that each state contains the expected keys
		for (const state of aclStates) {
			const stateKeys = state.state.map((x) => x.key);
			expect(stateKeys).toEqual(expectedKeys);
		}

		const drpStates = drpObject.drpStates.values();
		const expectedDrpKeys = Object.keys(drpObject.drp ?? {});

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
			peerId: "peer1",
			drp: new CounterDRP(),
		});

		const testDRP = obj.drp as CounterDRP;
		expect(testDRP).toBeDefined();
		const ret = testDRP.test();
		expect(ret).toBe(counter);
	});
});

describe("Merging vertices tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;

	beforeEach(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
	});

	test("Test: merge should skip unknown dependencies", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 19)));

		obj1.drp?.add(1);
		obj2.drp?.add(2);
		await obj1.merge(obj2.hashGraph.getAllVertices());
		obj1.drp?.add(3);

		const vertex = obj1.vertices.find((v) => v.operation?.opType === "add" && v.operation.value[0] === 3);
		if (!vertex) {
			throw new Error("Vertex not found");
		}
		expect(await obj2.merge([vertex])).toEqual([
			false,
			["e5ef52c6186abe51635619df8bc8676c19f5a6519e40f47072683437255f026a"],
		]);
	});
});

class AsyncPushToArrayDRP implements IDRP {
	semanticsType = SemanticsType.pair;
	context: DrpRuntimeContext = { caller: "" };

	private _array: number[];

	constructor() {
		this._array = [];
	}

	push(value: number): void {
		this._array.push(value);
	}

	async pushAsync(value: number): Promise<void> {
		await Promise.resolve();
		this._array.push(value);
	}

	query_array(): number[] {
		return this._array;
	}

	resolveConflicts(v: Vertex[]): ResolveConflictsType {
		const first = v[0];
		const second = v[1];
		if (first.operation?.value[0] > second.operation?.value[0]) {
			return { action: ActionType.Swap };
		}
		return { action: ActionType.Nop };
	}
}

describe("Async counter DRP", () => {
	let drpObject1: DRPObject<AsyncCounterDRP>;
	let drpObject2: DRPObject<AsyncCounterDRP>;

	beforeEach(() => {
		drpObject1 = new DRPObject({ peerId: "peer1", acl, drp: new AsyncCounterDRP() });
		drpObject2 = new DRPObject({ peerId: "peer2", acl, drp: new AsyncCounterDRP() });
	});

	test("async drp", async () => {
		const value1 = await drpObject1.drp?.increment();
		const value2 = await drpObject2.drp?.increment();

		expect(value1).toEqual(1);
		expect(value2).toEqual(1);
		const obj2Vertices = drpObject2.hashGraph.getAllVertices();
		const obj1Vertices = drpObject1.hashGraph.getAllVertices();
		await drpObject1.merge(obj2Vertices);
		expect(drpObject1.drp?.query_value()).toEqual(2);
		await drpObject2.merge(obj1Vertices);
		expect(drpObject2.drp?.query_value()).toEqual(2);
		await drpObject2.drp?.increment();
		await drpObject2.drp?.increment();
		await drpObject2.drp?.increment();
		await drpObject1.merge(drpObject2.hashGraph.getAllVertices());
		expect(drpObject1.drp?.query_value()).toEqual(5);
	});
});

describe("Async push to array DRP", () => {
	let drpObject1: DRPObject<AsyncPushToArrayDRP>;
	let drpObject2: DRPObject<AsyncPushToArrayDRP>;

	beforeEach(() => {
		vi.useFakeTimers();
		drpObject1 = new DRPObject({ peerId: "peer1", acl, drp: new AsyncPushToArrayDRP() });
		drpObject2 = new DRPObject({ peerId: "peer2", acl, drp: new AsyncPushToArrayDRP() });
	});

	test("async drp", async () => {
		drpObject1.drp?.push(1);
		vi.advanceTimersByTime(1000);
		drpObject2.drp?.push(2);
		vi.advanceTimersByTime(1000);
		drpObject1.drp?.push(3);
		vi.advanceTimersByTime(1000);
		const obj1Vertices = drpObject1.hashGraph.getAllVertices();
		const obj2Vertices = drpObject2.hashGraph.getAllVertices();
		await drpObject1.merge(obj2Vertices);
		await drpObject2.merge(obj1Vertices);
		expect(drpObject1.drp?.query_array()).toEqual([1, 2, 3]);
		expect(drpObject2.drp?.query_array()).toEqual([1, 2, 3]);

		await drpObject1.drp?.pushAsync(4);
		expect(drpObject1.drp?.context.caller).toEqual("peer1");
		vi.advanceTimersByTime(1000);
		drpObject1.drp?.push(5);
		expect(drpObject1.drp?.context.caller).toEqual("peer1");
		vi.advanceTimersByTime(1000);
		await drpObject2.drp?.pushAsync(6);
		expect(drpObject2.drp?.context.caller).toEqual("peer2");
		vi.advanceTimersByTime(1000);
		await drpObject2.merge(drpObject1.hashGraph.getAllVertices());
		await drpObject1.merge(drpObject2.hashGraph.getAllVertices());
		expect(drpObject1.drp?.query_array()).toEqual([1, 2, 3, 4, 5, 6]);
		expect(drpObject2.drp?.query_array()).toEqual([1, 2, 3, 4, 5, 6]);
	});
});

class ThrowingDRP extends SetDRP<number> {
	semanticsType = SemanticsType.pair;

	throw(): void {
		throw new Error("Not implemented");
	}
}

describe("Throwing DRP", () => {
	let drpObject: DRPObject<ThrowingDRP>;

	beforeEach(() => {
		drpObject = new DRPObject({ peerId: "peer1", drp: new ThrowingDRP() });
	});

	test("throw", () => {
		expect(() => drpObject.drp?.throw()).toThrowError("Error while applying operation throw: Error: Not implemented");
	});
});
