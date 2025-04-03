import { MapConflictResolution, MapDRP, SetDRP } from "@ts-drp/blueprints";
import { AsyncCounterDRP } from "@ts-drp/test-utils";
import {
	ACLGroup,
	ActionType,
	type DrpRuntimeContext,
	type IDRP,
	type ResolveConflictsType,
	SemanticsType,
	type Vertex,
} from "@ts-drp/types";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";

import { createACL } from "../src/acl/index.js";
import { createObject, DRPObject } from "../src/index.js";

const acl = createACL({ admins: ["peer1", "peer2", "peer3"] });

class SetDRPWithContext<T> implements IDRP {
	semanticsType = SemanticsType.pair;
	context: DrpRuntimeContext = { caller: "" };
	private _set: Set<T>;

	constructor() {
		this._set = new Set();
	}

	add(value: T): void {
		this._set.add(value);
	}

	delete(value: T): void {
		this._set.delete(value);
	}

	query_has(value: T): boolean {
		return this._set.has(value);
	}

	query_getValues(): T[] {
		return Array.from(this._set.values());
	}
}

describe("AccessControl tests with RevokeWins resolution", () => {
	beforeEach(() => {});

	test("Test creating DRPObject wo/ ACL", () => {
		const obj = new DRPObject({ peerId: "" });
		expect(obj.acl).toBeDefined();
	});

	test("Test creating an object wo/ DRP", () => {
		const obj = createObject({ peerId: "" });
		expect(obj.drp).toBeUndefined();
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
		const aclStates = drpObject["_states"]["aclStates"].values();
		const expectedKeys = Object.keys(drpObject.acl);

		// Check that each state contains the expected keys
		for (const state of aclStates) {
			const stateKeys = state.state.map((x) => x.key);
			expect(stateKeys).toEqual(expectedKeys);
		}

		const drpStates = drpObject["_states"]["drpStates"].values();
		const expectedDrpKeys = Object.keys(drpObject.drp ?? {});

		// Check that each state contains the expected keys
		for (const state of drpStates) {
			const stateKeys = state.state.map((x) => x.key);
			expect(stateKeys).toEqual(expectedDrpKeys);
		}

		expect(drpObject.acl).toBeDefined();
		expect(drpObject.drp).toBeDefined();
		expect(drpObject.drp?.query_getValues()).toEqual([1]);

		expect(drpObject.vertices.length).toBe(2);
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

		expect(obj.drp).toBeDefined();
		const ret = obj.drp?.test();
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
		await obj1.applyVertices(obj2.vertices);
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
		await obj1.applyVertices(obj2.vertices);
		obj1.drp?.add(3);

		const vertex1 = obj1.vertices.find((v) => v.operation?.opType === "add" && v.operation.value[0] === 1);
		if (!vertex1) {
			throw new Error("Vertex not found 1");
		}
		const vertex2 = obj1.vertices.find((v) => v.operation?.opType === "add" && v.operation.value[0] === 2);
		if (!vertex2) {
			throw new Error("Vertex not found 2");
		}
		const vertex3 = obj1.vertices.find((v) => v.operation?.opType === "add" && v.operation.value[0] === 3);
		if (!vertex3) {
			throw new Error("Vertex not found 3");
		}
		expect(await obj2.applyVertices([vertex3])).toEqual({
			applied: false,
			missing: ["e5ef52c6186abe51635619df8bc8676c19f5a6519e40f47072683437255f026a"],
		});
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
		const obj2Vertices = drpObject2.vertices;
		const obj1Vertices = drpObject1.vertices;
		await drpObject1.merge(obj2Vertices);
		expect(drpObject1.drp?.query_value()).toEqual(2);
		await drpObject2.merge(obj1Vertices);
		expect(drpObject2.drp?.query_value()).toEqual(2);
		await drpObject2.drp?.increment();
		await drpObject2.drp?.increment();
		await drpObject2.drp?.increment();
		await drpObject1.merge(drpObject2.vertices);
		expect(drpObject2.drp?.query_value()).toEqual(5);
		expect(drpObject1.drp?.query_value()).toEqual(5);
	});
});

describe("Async push to array DRP", () => {
	let drpObject1: DRPObject<AsyncPushToArrayDRP>;
	let drpObject2: DRPObject<AsyncPushToArrayDRP>;

	beforeEach(() => {
		vi.useFakeTimers({ now: 0 });
		drpObject1 = new DRPObject({ peerId: "peer1", acl, drp: new AsyncPushToArrayDRP() });
		drpObject2 = new DRPObject({ peerId: "peer2", acl, drp: new AsyncPushToArrayDRP() });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("async drp", async () => {
		drpObject1.drp?.push(1);
		vi.advanceTimersByTime(1000);
		drpObject2.drp?.push(2);
		vi.advanceTimersByTime(1000);
		drpObject1.drp?.push(3);
		vi.advanceTimersByTime(1000);
		const obj1Vertices = drpObject1.vertices;
		const obj2Vertices = drpObject2.vertices;
		await drpObject1.applyVertices(obj2Vertices);
		await drpObject2.applyVertices(obj1Vertices);
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
		await drpObject2.applyVertices(drpObject1.vertices);
		await drpObject1.applyVertices(drpObject2.vertices);
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
		expect(() => drpObject.drp?.throw()).toThrowError("Not implemented");
	});
});

describe("DRPObject validation tests", () => {
	let obj1: DRPObject<MapDRP<string, string>>;
	let obj2: DRPObject<MapDRP<string, string>>;
	beforeEach(() => {
		obj1 = new DRPObject({
			peerId: "peer1",
			acl,
			drp: new MapDRP<string, string>(),
		});

		obj2 = new DRPObject({
			peerId: "peer2",
			acl,
			drp: new MapDRP<string, string>(),
		});
	});

	test("Should accept vertices with valid hash", async () => {
		obj1.drp?.set("key1", "value1");
		obj2.drp?.set("key2", "value2");

		await obj2.merge(obj1.vertices);
		expect(obj2.vertices.length).toBe(3);
		expect(obj2.vertices.length).toBe(3);
	});
});

describe("HashGraph hook tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	beforeEach(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
	});

	test("New operations are hooked from callFn", () => {
		const newVertices: Vertex[] = [];

		obj1.subscribe((_, origin, vertices) => {
			if (origin === "callFn") {
				newVertices.push(...vertices);
			}
		});
		for (let i = 1; i < 100; i++) {
			obj1.drp?.add(i);
			expect(newVertices.length).toBe(i);
			expect(newVertices[i - 1].operation?.opType).toBe("add");
			expect(newVertices[i - 1].operation?.value[0]).toBe(i);
		}
	});

	test("Merged operations are hooked from merge", async () => {
		const newVertices: Vertex[] = [];

		obj2.subscribe((_, origin, vertices) => {
			if (origin === "merge") {
				newVertices.push(...vertices);
			}
		});
		for (let i = 1; i < 100; i++) {
			obj1.drp?.add(i);
			await obj2.merge(obj1.vertices);
			expect(newVertices.length).toBe(i);
			expect(newVertices[i - 1].operation?.opType).toBe("add");
			expect(newVertices[i - 1].operation?.value[0]).toBe(i);
		}
	});
});

describe("DRP Context tests", () => {
	let obj1: DRPObject<SetDRPWithContext<number>>;
	let obj2: DRPObject<SetDRPWithContext<number>>;
	let obj3: DRPObject<SetDRPWithContext<number>>;

	beforeEach(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRPWithContext<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRPWithContext<number>() });
		obj3 = new DRPObject({ peerId: "peer3", acl, drp: new SetDRPWithContext<number>() });
	});

	test("caller should be empty if no operation is applied", () => {
		expect(obj1.drp?.context.caller).toBe("");
	});

	test("caller should be current node's peerId if operation is applied locally", () => {
		for (let i = 0; i < 10; i++) {
			obj1.drp?.add(i);
			expect(obj1.drp?.context.caller).toBe("peer1");
		}

		for (let i = 0; i < 10; i++) {
			obj2.drp?.add(i);
			expect(obj2.drp?.context.caller).toBe("peer2");
		}
	});

	test("caller should be the peerId of the node that applied the operation", async () => {
		for (let i = 1; i <= 10; ++i) {
			obj1.drp?.add(i);
			expect(obj1.drp?.context.caller).toBe("peer1");
			await obj2.merge(obj1.vertices);

			obj2.drp?.add(10 + i);
			const vertices2 = obj2.vertices;
			await obj1.merge([vertices2[vertices2.length - 1]]);
			expect(obj1.drp?.context.caller).toBe("peer2");

			await obj3.merge(obj2.vertices);
			obj3.drp?.add(20 + i);
			const vertices3 = obj3.vertices;
			await obj2.merge([vertices3[vertices3.length - 1]]);
			expect(obj2.drp?.context.caller).toBe("peer3");
			await obj1.merge([vertices3[vertices3.length - 1]]);
			expect(obj1.drp?.context.caller).toBe("peer3");
		}
	});

	test("should not update the caller if the state is not changed", async () => {
		for (let i = 0; i < 10; ++i) {
			if (i % 2 === 0) {
				obj1.drp?.add(i);
				expect(obj1.drp?.context.caller).toBe("peer1");
				await obj2.merge(obj1.vertices);
				expect(obj2.drp?.context.caller).toBe("peer1");
				obj2.drp?.add(i);
				expect(obj2.drp?.context.caller).toBe("peer1");
			} else {
				obj2.drp?.add(i);
				expect(obj2.drp?.context.caller).toBe("peer2");
				await obj1.merge(obj2.vertices);
				expect(obj1.drp?.context.caller).toBe("peer2");
				obj1.drp?.add(i);
				expect(obj1.drp?.context.caller).toBe("peer2");
			}
		}
	});
});

describe("ACL admin permission tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	let obj3: DRPObject<SetDRP<number>>;

	beforeEach(() => {
		obj1 = new DRPObject({
			peerId: "peer1",
			acl: createACL({ admins: ["peer1"] }),
			drp: new SetDRP<number>(),
		});
		obj2 = new DRPObject({
			peerId: "peer2",
			acl: createACL({ admins: ["peer1", "peer2"] }),
			drp: new SetDRP<number>(),
		});
		obj3 = new DRPObject({
			peerId: "peer3",
			acl: createACL({ admins: ["peer1"] }),
			drp: new SetDRP<number>(),
		});
	});

	test("Should not able to grant if node an admin", async () => {
		obj2.acl.grant("peer3", ACLGroup.Writer);
		expect(obj2.acl.query_isWriter("peer3")).toBe(true);

		await obj1.merge(obj2.vertices);
		expect(obj1.acl.query_isWriter("peer3")).toBe(false);
		await obj3.merge(obj2.vertices);
		expect(obj3.acl.query_isWriter("peer3")).toBe(false);
	});

	test("Should not able to revoke if node an admin", async () => {
		obj1.acl.grant("peer3", ACLGroup.Writer);
		expect(obj1.acl.query_isWriter("peer3")).toBe(true);

		await obj3.merge(obj1.vertices);
		expect(obj3.acl.query_isWriter("peer3")).toBe(true);
		obj3.drp?.add(1);
		expect(obj3.drp?.query_has(1)).toBe(true);

		await obj2.merge(obj3.vertices);
		expect(obj2.drp?.query_has(1)).toBe(true);
		obj2.acl.revoke("peer3", ACLGroup.Writer);
		expect(obj2.acl.query_isWriter("peer3")).toBe(false);

		await obj3.merge(obj2.vertices);
		expect(obj3.acl.query_isWriter("peer3")).toBe(true);
	});

	test("Should able to grant/revoke if node an admin", async () => {
		obj1.acl.grant("peer3", ACLGroup.Writer);
		expect(obj1.acl.query_isWriter("peer3")).toBe(true);
		await obj3.merge(obj1.vertices);
		obj1.acl.grant("peer2", ACLGroup.Admin);
		obj1.acl.grant("peer2", ACLGroup.Writer);
		await obj2.merge(obj1.vertices);

		obj3.drp?.add(1);
		await obj2.merge(obj3.vertices);
		expect(obj2.drp?.query_has(1)).toBe(true);
		obj2.acl.revoke("peer3", ACLGroup.Writer);
		obj2.acl.grant("peer3", ACLGroup.Finality);

		const [applied, missed] = await obj1.merge(obj2.vertices);
		expect(applied).toBe(true);
		expect(missed.length).toBe(0);
		expect(obj1.acl.query_isWriter("peer3")).toBe(false);
		expect(obj1.acl.query_isFinalitySigner("peer3")).toBe(true);
	});
});

describe("HashGraph for delete wins map tests", () => {
	let obj1: DRPObject<MapDRP<string, string>>;
	let obj2: DRPObject<MapDRP<string, string>>;

	beforeEach(() => {
		obj1 = new DRPObject({
			peerId: "peer1",
			acl,
			drp: new MapDRP<string, string>(MapConflictResolution.DeleteWins),
		});
		obj2 = new DRPObject({
			peerId: "peer2",
			acl,
			drp: new MapDRP<string, string>(MapConflictResolution.DeleteWins),
		});
	});

	test("Should resolve conflict between concurrent set and delete operations that delete wins after merging", async () => {
		/*
		       __ V1:SET("key1", "value1")
		      /
		  ROOT
		      \
		       -- V2:SET("key1", "value2") -- DELETE("key1")
		*/
		obj1.drp?.set("key1", "value1"); // greater hash
		obj2.drp?.set("key1", "value2"); // smaller hash
		obj2.drp?.delete("key1");

		expect(obj1.drp?.query_get("key1")).toBe("value1");
		await obj1.merge(obj2.vertices);
		expect(obj1.drp?.query_get("key1")).toBe(undefined);
	});

	test("Should resolve conflict between concurrent set and delete operations that delete wins after merging complex case", async () => {
		/*
		       __V1:SET("key1", "value2") -- V3:DELETE("key1") -- V5:SET("key2", "value3") -- V6:DELETE("key2")
		      /                          \                      /
		  ROOT                            \____________________/
		      \                           /\
		       --V2:SET("key1", "value1") -- V4:SET("key2", "value3")
		*/

		obj1.drp?.set("key1", "value2");
		obj2.drp?.set("key1", "value1");
		await obj2.merge(obj1.vertices);

		expect(obj2.drp?.query_get("key1")).toBe("value1");
		obj1.drp?.delete("key1");
		await obj1.merge(obj2.vertices);
		expect(obj1.drp?.query_get("key1")).toBe(undefined);

		obj2.drp?.set("key2", "value3");
		obj1.drp?.delete("key2"); // dropped;
		await obj2.merge(obj1.vertices);
		expect(obj2.drp?.query_get("key2")).toBe("value3");

		obj1.drp?.set("key2", "value3");
		obj1.drp?.delete("key2");
		await obj2.merge(obj1.vertices);
		expect(obj1.drp?.query_get("key2")).toBe(undefined);
	});
});

describe("HashGraph for set wins map tests", () => {
	let obj1: DRPObject<MapDRP<string, string>>;
	let obj2: DRPObject<MapDRP<string, string>>;
	let obj3: DRPObject<MapDRP<string, string>>;

	beforeEach(() => {
		obj1 = new DRPObject({
			peerId: "peer1",
			acl,
			drp: new MapDRP<string, string>(),
		});
		obj2 = new DRPObject({
			peerId: "peer2",
			acl,
			drp: new MapDRP<string, string>(),
		});
		obj3 = new DRPObject({
			peerId: "peer3",
			acl,
			drp: new MapDRP<string, string>(),
		});
	});

	test("Should correctly perform set and delete map operations", async () => {
		/*
		       __ V1:SET("key1", "value1") -- V3:DELETE("key1")
		      /
		  ROOT
		      \
		       -- V2:SET("key2, "value2")
		*/
		obj1.drp?.set("key1", "value1");
		obj2.drp?.set("key2", "value2");
		obj1.drp?.delete("key1");

		await obj1.merge(obj2.vertices);
		await obj2.merge(obj1.vertices);

		expect(obj1.drp?.query_get("key2")).toBe("value2");
		expect(obj2.drp?.query_get("key1")).toBe(undefined);
	});

	test("Should resolve conflicts between concurrent set and delete operations that set wins after merging", async () => {
		/*
		       __ V1:SET("key1", "value2") ------------------------- V5:DELETE("key2")
		      /                                                    /
		  ROOT                                                    /
		      \                                                  /
		       --- V2:SET("key1", "value1") -- V3:DELETE("key1") -- V4:SET("key2", "value2")
		*/

		obj1.drp?.set("key1", "value2"); // smaller hash
		obj2.drp?.set("key1", "value1"); // greater hash
		obj2.drp?.delete("key1");

		expect(obj1.drp?.query_get("key1")).toBe("value2");
		await obj1.merge(obj2.vertices);
		expect(obj1.drp?.query_get("key1")).toBe(undefined);

		obj2.drp?.set("key2", "value2");
		obj1.drp?.delete("key2");

		expect(obj2.drp?.query_get("key2")).toBe("value2");
		await obj2.merge(obj1.vertices);
		expect(obj2.drp?.query_get("key2")).toBe("value2");
	});

	test("Should resolve conflict between concurrent set and delete operations that set wins after merging complex case", async () => {
		/*
		        __ V1:SET("key1", "value1") -- V2:DELETE("key2") -- V5:SET("key2", "value1")
		       /                                                                            \
		      /                                                                              \
		  ROOT -- V3:DELETE("key3") -- V4:SET("key2", "value2") ------------------------------ V7:DELETE("key1")
		      \                                                    \                           \
		       \                                                    ----------------------------\
		        -- V6:SET("key2", "eulav3") ---------------------------------------------------- v8:SET("key1", "value")
		*/

		obj1.drp?.set("key1", "value1");
		obj1.drp?.delete("key2");
		obj2.drp?.delete("key3");
		obj2.drp?.set("key2", "value2");
		await obj1.merge(obj2.vertices);
		await obj2.merge(obj1.vertices);
		expect(obj1.drp?.query_get("key2")).toBe("value2");

		obj3.drp?.set("key2", "eulav3");
		await obj3.merge(obj1.vertices);
		expect(obj3.drp?.query_get("key2")).toBe("eulav3");

		obj2.drp?.delete("key1");
		expect(obj2.drp?.query_get("key1")).toBe(undefined);
		obj3.drp?.set("key1", "value");
		await obj1.merge(obj3.vertices);
		await obj1.merge(obj2.vertices);
		expect(obj1.drp?.query_get("key1")).toBe("value");
	});
});

describe("Hashgraph for SetDRP and ACL tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	let obj3: DRPObject<SetDRP<number>>;

	beforeEach(async () => {
		const acl = createACL({ admins: ["peer1"] });
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
		obj3 = new DRPObject({ peerId: "peer3", acl, drp: new SetDRP<number>() });

		obj1.acl.grant("peer2", ACLGroup.Finality);
		obj1.acl.grant("peer3", ACLGroup.Finality);
		await obj2.merge(obj1.vertices);
		await obj3.merge(obj1.vertices);
	});

	test("Node without writer permission can generate vertex locally", () => {
		obj1.drp?.add(1);
		obj1.drp?.add(2);

		expect(obj1.drp?.query_has(1)).toBe(true);
		expect(obj1.drp?.query_has(2)).toBe(true);
	});

	test("Accept vertex if creator has write permission", async () => {
		/*
		  ROOT -- V1:ADD(1) -- V2:GRANT(peer2) -- V3:ADD(4)
		*/

		obj1.drp?.add(1);
		obj1.acl?.grant("peer2", ACLGroup.Writer);
		expect(obj1.acl?.query_isAdmin("peer1")).toBe(true);

		await obj2.merge(obj1.vertices);
		expect(obj2.drp?.query_has(1)).toBe(true);
		expect(obj2.acl?.query_isWriter("peer2")).toBe(true);

		obj2.drp?.add(4);
		await obj1.merge(obj2.vertices);
		expect(obj1.drp?.query_has(4)).toBe(true);
	});

	test("Should grant admin permission to a peer", () => {
		const newAdminPeer1 = "newAdminPeer1";
		obj1.acl?.grant("newAdminPeer1", ACLGroup.Admin);
		expect(obj1.acl?.query_isAdmin(newAdminPeer1)).toBe(true);
	});

	test("Should update key in the ACL", async () => {
		obj1.acl.setKey("blsPublicKey1");

		await obj2.merge(obj1.vertices);
		expect(obj2.acl.query_getPeerKey("peer1")).toStrictEqual("blsPublicKey1");

		obj1.acl.grant("peer2", ACLGroup.Writer);
		obj1.acl.grant("peer3", ACLGroup.Writer);

		await obj2.merge(obj1.vertices);
		await obj3.merge(obj1.vertices);

		obj3.acl.setKey("blsPublicKey3");
		obj2.acl.setKey("blsPublicKey2");

		await obj1.merge(obj2.vertices);
		await obj1.merge(obj3.vertices);
		expect(obj1.acl.query_getPeerKey("peer2")).toStrictEqual("blsPublicKey2");
		expect(obj1.acl.query_getPeerKey("peer3")).toStrictEqual("blsPublicKey3");
	});
});

describe("Hashgraph for SetDRP and ACL tests", () => {
	test("Should use ACL on dependencies to determine if vertex is valid", async () => {
		/*
		  ROOT -- V1:ADD(1) -- V2:ADD(2) -- V3:GRANT(peer2)
		  					\_ V4:ADD(3) (invalid)
		*/
		const acl = createACL({ admins: ["peer1"] });

		const obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		const obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });

		obj1.drp?.add(1);
		await obj2.merge(obj1.vertices);
		obj1.drp?.add(2);

		expect(() => obj2.drp?.add(3)).toThrowError(); // shall fail as we don't have permission yet
		await obj1.merge(obj2.vertices);
		expect(obj1.drp?.query_has(3)).toBe(false);

		obj1.acl.grant("peer2", ACLGroup.Writer);
		await obj2.merge(obj1.vertices); // add acl to peer2
		obj2.drp?.add(3); // shall fail as we don't have permission yet
		await obj1.merge(obj2.vertices);
		expect(obj1.drp?.query_has(3)).toBe(true);
	});
});
