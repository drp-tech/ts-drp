import { ActionType } from "@ts-drp/types";
import { beforeEach, describe, expect, test } from "vitest";

import { MapDRP } from "../src/index.js";

describe("MapDRP tests", () => {
	let drp: MapDRP<string, string>;

	beforeEach(() => {
		drp = new MapDRP<string, string>();
	});

	test("Should add new entry", () => {
		drp.set("key1", "value1");
		drp.set("key2", "value2");
		expect(drp.query_get("key1")).toBe("value1");
		expect(drp.query_get("key2")).toBe("value2");
		expect(drp.query_entries()).toEqual([
			["key1", "value1"],
			["key2", "value2"],
		]);
		expect(drp.query_keys()).toEqual(["key1", "key2"]);
		expect(drp.query_values()).toEqual(["value1", "value2"]);
	});

	test("Should set existing entries", () => {
		drp.set("key1", "value1");
		drp.set("key2", "value2");

		expect(drp.query_get("key1")).toBe("value1");
		expect(drp.query_get("key2")).toBe("value2");

		drp.set("key1", "value3");
		expect(drp.query_get("key1")).toBe("value3");

		drp.set("key2", "value4");
		expect(drp.query_get("key2")).toBe("value4");
	});

	test("Should set existing entries multiple times", () => {
		drp.set("key1", "value1");
		expect(drp.query_get("key1")).toBe("value1");
		drp.set("key2", "value2");
		drp.set("key2", "value3");
		drp.set("key2", "value4");
		expect(drp.query_get("key2")).toBe("value4");
	});

	test("Should set and delete existing entries", () => {
		drp.set("key1", "value1");
		expect(drp.query_get("key1")).toBe("value1");
		drp.delete("key1");
		expect(drp.query_get("key1")).toBe(undefined);

		drp.set("key1", "value2");
		expect(drp.query_has("key1")).toBe(true);

		drp.set("key2", "value3");
		drp.delete("key1");
		expect(drp.query_has("key1")).toBe(false);
		expect(drp.query_get("key2")).toBe("value3");
	});

	test("Should work correctly when delete is called on non-existing key", () => {
		drp.set("key1", "value1");
		drp.set("key2", "value2");
		drp.delete("key3");
		expect(drp.query_get("key1")).toBe("value1");
		expect(drp.query_get("key2")).toBe("value2");
		expect(drp.query_entries()).toEqual([
			["key1", "value1"],
			["key2", "value2"],
		]);
	});

	test("Should return no-op when resolve conflict between operations with different keys", () => {
		const vertex0 = {
			hash: "hash1",
			peerId: "peer1",
			operation: {
				drpType: "DRP",
				opType: "set",
				value: ["key1", "value1"],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};

		const vertex1 = {
			hash: "hash2",
			peerId: "peer2",
			operation: {
				drpType: "DRP",
				opType: "set",
				value: ["key2", "value2"],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};

		let vertices = [vertex0, vertex1];
		expect(drp.resolveConflicts(vertices)).toEqual({ action: ActionType.Nop });
		vertex0.operation.value[0] = "delete";
		expect(drp.resolveConflicts(vertices)).toEqual({ action: ActionType.Nop });
		vertices = [vertex1, vertex0];
		expect(drp.resolveConflicts(vertices)).toEqual({ action: ActionType.Nop });
	});

	test("Should return no-op when resolve conflict between two delete operations", () => {
		const vertex0 = {
			hash: "hash1",
			peerId: "peer1",
			operation: {
				drpType: "DRP",
				opType: "delete",
				value: ["key1"],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};
		const vertex1 = {
			hash: "hash2",
			peerId: "peer2",
			operation: {
				drpType: "DRP",
				opType: "delete",
				value: ["key2"],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};

		const vertices = [vertex0, vertex1];
		expect(drp.resolveConflicts(vertices)).toEqual({ action: ActionType.Nop });
	});

	test("Should drop operation with lower hash value when resolve conflict between two set operations", () => {
		const vertex0 = {
			hash: "hash1",
			peerId: "peer1",
			operation: {
				drpType: "DRP",
				opType: "set",
				value: ["key1", "value1"],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};

		const vertex1 = {
			hash: "hash2",
			peerId: "peer2",
			operation: {
				drpType: "DRP",
				opType: "set",
				value: ["key1", "value2"],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};

		let vertices = [vertex0, vertex1];
		expect(drp.resolveConflicts(vertices)).toEqual({
			action: ActionType.DropRight,
		});

		vertices = [vertex1, vertex0];
		expect(drp.resolveConflicts(vertices)).toEqual({
			action: ActionType.DropLeft,
		});

		vertex1.operation.value[1] = "value1";
		vertices = [vertex0, vertex1];
		expect(drp.resolveConflicts(vertices)).toEqual({ action: ActionType.Nop });
	});

	test("Should drop delete operation when resolve conflict between set and delete operations", () => {
		const vertex0 = {
			hash: "hash1",
			peerId: "peer1",
			operation: {
				drpType: "DRP",
				opType: "set",
				value: ["key1", "value1"],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};

		const vertex1 = {
			hash: "hash2",
			peerId: "peer2",
			operation: {
				drpType: "DRP",
				opType: "delete",
				value: ["key1"],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};

		let vertices = [vertex0, vertex1];
		expect(drp.resolveConflicts(vertices)).toEqual({
			action: ActionType.DropRight,
		});

		vertices = [vertex1, vertex0];
		expect(drp.resolveConflicts(vertices)).toEqual({
			action: ActionType.DropLeft,
		});
	});
});
