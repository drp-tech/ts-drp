import { ActionType } from "@ts-drp/object";
import type { Vertex } from "@ts-drp/types";
import { beforeEach, describe, expect, test } from "vitest";

import { RecursiveMulDRP } from "../src/RecursiveMul/index.js";

describe("RecMulDRP tests", () => {
	let drp: RecursiveMulDRP;

	beforeEach(() => {
		drp = new RecursiveMulDRP();
	});

	test("Test: recursive_mul (Basic)", () => {
		drp.recursive_mul(3);
		let val = drp.query_value();
		expect(val).toEqual(3); // 1 * 3

		drp.recursive_mul(4);
		val = drp.query_value();
		expect(val).toEqual(12); // 3 * 4

		drp.recursive_mul(0);
		expect(drp.query_value()).toEqual(12); // Should not change for 0
	});

	test("Test: recursive_mul (Type Safety)", () => {
		drp.recursive_mul(2);
		expect(drp.query_value()).toEqual(2); // 1 * 2

		// @ts-expect-error Testing invalid input
		drp.recursive_mul("");
		expect(drp.query_value()).toEqual(2);

		// @ts-expect-error Testing invalid input
		drp.recursive_mul(true);
		expect(drp.query_value()).toEqual(2);

		// @ts-expect-error Testing invalid input
		drp.recursive_mul({});
		expect(drp.query_value()).toEqual(2);
	});

	test("Test: initialValue (Basic)", () => {
		drp = new RecursiveMulDRP({ initialValue: 10 });
		expect(drp.query_value()).toEqual(10);

		drp = new RecursiveMulDRP({ initialValue: -10 });
		expect(drp.query_value()).toEqual(-10);

		drp = new RecursiveMulDRP({ initialValue: 0 });
		expect(drp.query_value()).toEqual(0);

		drp = new RecursiveMulDRP();
		expect(drp.query_value()).toEqual(1); // Default value is 1 for multiplication
	});

	test("Test: initialValue (Type Safety)", () => {
		// @ts-expect-error Testing invalid input
		drp = new RecursiveMulDRP("10");
		expect(drp.query_value()).toEqual(1);

		// @ts-expect-error Testing invalid input
		drp = new RecursiveMulDRP(true);
		expect(drp.query_value()).toEqual(1);

		// @ts-expect-error Testing invalid input
		drp = new RecursiveMulDRP([]);
		expect(drp.query_value()).toEqual(1);
	});

	test("Test: resolveConflicts (Basic)", () => {
		const vertex1: Vertex = {
			hash: "1",
			peerId: "1",
			operation: {
				drpType: "DRP",
				opType: "recursive_mul",
				value: [3],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};
		const vertex2: Vertex = {
			hash: "2",
			peerId: "2",
			operation: {
				drpType: "DRP",
				opType: "recursive_mul",
				value: [2],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};

		let action = drp.resolveConflicts([]);
		expect(action).toEqual({ action: ActionType.Nop });

		action = drp.resolveConflicts([vertex1]);
		expect(action).toEqual({ action: ActionType.Nop });

		action = drp.resolveConflicts([vertex1, vertex2]);
		expect(action).toEqual({ action: ActionType.Nop });
	});

	test("Test: resolveConflicts (Type Safety)", () => {
		const vertex1: Vertex = {
			hash: "1",
			peerId: "1",
			operation: {
				drpType: "DRP",
				opType: "recursive_mul",
				value: [2],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};

		const vertex2 = {};

		const action = drp.resolveConflicts([vertex1, vertex2]);
		expect(action).toEqual({ action: ActionType.Nop });
	});
});
