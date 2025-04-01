import { ActionType, Operation, Vertex } from "@ts-drp/types";
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
		// @ts-expect-error - weird input
		drp.add("");
		expect(drp.query_value()).toEqual(5);

		// @ts-expect-error - weird input
		drp.add(true);
		expect(drp.query_value()).toEqual(5);

		// @ts-expect-error - weird input
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
		// @ts-expect-error - weird input
		drp.mul("");
		expect(drp.query_value()).toEqual(5);

		// @ts-expect-error - weird input
		drp.mul(true);
		expect(drp.query_value()).toEqual(5);

		// @ts-expect-error - weird input
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
		// @ts-expect-error - weird input
		drp = new AddMulDRP("10");
		expect(drp.query_value()).toEqual(0);

		// @ts-expect-error - weird input
		drp = new AddMulDRP(true);
		expect(drp.query_value()).toEqual(0);

		// @ts-expect-error - weird input
		drp = new AddMulDRP({});
		expect(drp.query_value()).toEqual(0);

		// @ts-expect-error - weird input
		drp = new AddMulDRP([]);
		expect(drp.query_value()).toEqual(0);
	});

	test("Test: resolveConflicts (Basic)", () => {
		const vertex1 = Vertex.create({
			hash: "1",
			peerId: "1",
			operation: Operation.create({ drpType: "DRP", opType: "add", value: [1] }),
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		});
		const vertex2 = Vertex.create({
			hash: "2",
			peerId: "2",
			operation: Operation.create({ drpType: "DRP", opType: "mul", value: [2] }),
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		});
		const vertex3 = Vertex.create({
			hash: "3",
			peerId: "3",
			operation: Operation.create({ drpType: "DRP", opType: "add", value: [1] }),
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		});
		const vertex4 = Vertex.create({
			hash: "4",
			peerId: "4",
			operation: Operation.create({ drpType: "DRP", opType: "mul", value: [1] }),
			dependencies: [],
			timestamp: 0,
			signature: new Uint8Array(),
		});

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
		const vertex1 = Vertex.create({ hash: "1", operation: Operation.create({ opType: "add" }) });
		const vertex2 = Vertex.create({ hash: "2", operation: Operation.create({ opType: "mulx" }) });
		const vertex3 = Vertex.create({ operation: Operation.create({ opType: "mul" }) });
		const vertex4 = Vertex.create({});

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
