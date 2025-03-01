import { ActionType } from "@ts-drp/types";
import { beforeEach, describe, expect, test } from "vitest";

import { AddMulDRP } from "../src/AddMul/index.js";

describe("AddMulDRP tests", () => {
	let drp: AddMulDRP;

	beforeEach(() => {
		drp = new AddMulDRP();
	});

	test("Test: Add (Basic)", () => {
		drp.add(1);
		let val = drp.query_value();
		expect(val).toEqual(1);

		drp.add(-12);
		val = drp.query_value();
		expect(val).toEqual(-11);

		drp.add(0.5);
		expect(drp.query_value()).toEqual(-10.5);
	});

	test("Test: Add (Weird inputs)", () => {
		drp.add(5);
		drp.add("");
		expect(drp.query_value()).toEqual(5);

		drp.add(true);
		expect(drp.query_value()).toEqual(5);

		drp.add({});
		expect(drp.query_value()).toEqual(5);
	});

	test("Test: Mul (Basic)", () => {
		drp.add(1);
		drp.mul(1);
		let val = drp.query_value();
		expect(val).toEqual(1);

		drp.mul(-12);
		val = drp.query_value();
		expect(val).toEqual(-12);

		drp.mul(0.5);
		expect(drp.query_value()).toEqual(-6);
	});

	test("Test: Mul (Weird inputs)", () => {
		drp.add(5);
		drp.mul("");
		expect(drp.query_value()).toEqual(5);

		drp.mul(true);
		expect(drp.query_value()).toEqual(5);

		drp.mul({});
		expect(drp.query_value()).toEqual(5);
	});

	test("Test: initialValue (Basic)", () => {
		drp = new AddMulDRP(10);
		expect(drp.query_value()).toEqual(10);

		drp = new AddMulDRP(-10);
		expect(drp.query_value()).toEqual(-10);

		drp = new AddMulDRP(0);
		expect(drp.query_value()).toEqual(0);

		drp = new AddMulDRP();
		expect(drp.query_value()).toEqual(0);
	});

	test("Test: initialValue (Weird inputs)", () => {
		drp = new AddMulDRP("10");
		expect(drp.query_value()).toEqual(0);

		drp = new AddMulDRP(true);
		expect(drp.query_value()).toEqual(0);

		drp = new AddMulDRP({});
		expect(drp.query_value()).toEqual(0);

		drp = new AddMulDRP([]);
		expect(drp.query_value()).toEqual(0);
	});

	test("Test: resolveConflicts (Basic)", () => {
		const vertex1 = {
			hash: "1",
			peerId: "1",
			operation: {
				drpType: "DRP",
				opType: "add",
				value: [1],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};
		const vertex2 = {
			hash: "2",
			peerId: "2",
			operation: {
				drpType: "DRP",
				opType: "mul",
				value: [2],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};
		const vertex3 = {
			hash: "3",
			peerId: "3",
			operation: {
				drpType: "DRP",
				opType: "add",
				value: [1],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};
		const vertex4 = {
			hash: "4",
			peerId: "4",
			operation: {
				drpType: "DRP",
				opType: "mul",
				value: [1],
			},
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		};

		let action = drp.resolveConflicts([]);
		expect(action).toEqual({ action: ActionType.Nop });
		action = drp.resolveConflicts([vertex1]);
		expect(action).toEqual({ action: ActionType.Nop });

		action = drp.resolveConflicts([vertex1, vertex1]);
		expect(action).toEqual({ action: ActionType.Nop });
		action = drp.resolveConflicts([vertex2, vertex2]);
		expect(action).toEqual({ action: ActionType.Nop });

		action = drp.resolveConflicts([vertex1, vertex2]);
		expect(action).toEqual({ action: ActionType.Nop });
		action = drp.resolveConflicts([vertex2, vertex1]);
		expect(action).toEqual({ action: ActionType.Swap });

		action = drp.resolveConflicts([vertex1, vertex3]);
		expect(action).toEqual({ action: ActionType.Nop });
		action = drp.resolveConflicts([vertex3, vertex1]);
		expect(action).toEqual({ action: ActionType.Nop });

		action = drp.resolveConflicts([vertex2, vertex4]);
		expect(action).toEqual({ action: ActionType.Nop });
		action = drp.resolveConflicts([vertex4, vertex2]);
		expect(action).toEqual({ action: ActionType.Nop });
	});

	test("Test: resolveConflicts (Weird inputs)", () => {
		const vertex1 = {
			hash: "1",
			operation: {
				opType: "add",
			},
		};
		const vertex2 = {
			hash: "2",
			operation: {
				opType: "mulx",
			},
		};
		const vertex3 = {
			operation: {
				opType: "mul",
			},
		};
		const vertex4 = {};

		let action = drp.resolveConflicts([vertex1, vertex2]);
		expect(action).toEqual({ action: ActionType.Nop });
		action = drp.resolveConflicts([vertex2, vertex1]);
		expect(action).toEqual({ action: ActionType.Nop });
		action = drp.resolveConflicts([vertex3, vertex1]);
		expect(action).toEqual({ action: ActionType.Nop });
		action = drp.resolveConflicts([vertex1, vertex4]);
		expect(action).toEqual({ action: ActionType.Nop });
	});
});
