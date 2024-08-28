import { beforeEach, describe, expect, test } from "vitest";
import { AddWinsSet } from "../../crdt/src/cros/AddWinsSet/index.js";
import { type TopologyObject, merge, newTopologyObject } from "../src/index.js";

describe("HashGraph for AddWinSet tests", () => {
	let obj1: TopologyObject<number>;
	let obj2: TopologyObject<number>;
	let obj3: TopologyObject<number>;

	beforeEach(async () => {
		obj1 = await newTopologyObject("peer1", new AddWinsSet<number>());
		obj2 = await newTopologyObject("peer2", new AddWinsSet<number>());
		obj3 = await newTopologyObject("peer3", new AddWinsSet<number>());
	});

	test("Test: Add Two Vertices", () => {
		/*
      V1:NOP <- V2:ADD(1) <- V2:REMOVE(1)
    */

		const cro1 = obj1.cro as AddWinsSet<number>;
		cro1.add(1);
		cro1.remove(1);
		expect(cro1.contains(1)).toBe(false);

		const linearOps = obj1.hashGraph.linearizeOperations();
		expect(linearOps).toEqual([
			{ type: "add", value: 1 },
			{ type: "remove", value: 1 },
		]);
	});

	test("Test: Add Two Concurrent Vertices With Same Value", () => {
		/*
                  _ V2:REMOVE(1)
      V1:ADD(1) /
                \ _ V3:ADD(1)
    */

		const cro1 = obj1.cro as AddWinsSet<number>;
		const cro2 = obj2.cro as AddWinsSet<number>;

		cro1.add(1);
		merge(obj2, obj1.hashGraph.getAllVertices());

		cro1.remove(1);
		cro2.add(1);
		merge(obj1, obj2.hashGraph.getAllVertices());
		merge(obj2, obj1.hashGraph.getAllVertices());

		expect(cro1.contains(1)).toBe(true);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearOps = obj1.hashGraph.linearizeOperations();
		expect(linearOps).toEqual([
			{ type: "add", value: 1 },
			{ type: "add", value: 1 },
		]);
	});

	test("Test: Add Two Concurrent Vertices With Different Values", () => {
		/*
                  _ V2:REMOVE(1)
      V1:ADD(1) /
                \ _ V3:ADD(2)
    */

		const cro1 = obj1.cro as AddWinsSet<number>;
		const cro2 = obj2.cro as AddWinsSet<number>;

		cro1.add(1);
		merge(obj2, obj1.hashGraph.getAllVertices());

		cro1.remove(1);
		cro2.add(2);
		merge(obj1, obj2.hashGraph.getAllVertices());
		merge(obj2, obj1.hashGraph.getAllVertices());

		expect(cro1.contains(1)).toBe(false);
		expect(cro1.contains(2)).toBe(true);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearOps = obj1.hashGraph.linearizeOperations();
		expect(linearOps).toEqual([
			{ type: "add", value: 1 },
			{ type: "add", value: 2 },
			{ type: "remove", value: 1 },
		]);
	});

	test("Test: Tricky Case", () => {
		/*
                  ___  V2:REMOVE(1) <- V4:ADD(10)
      V1:ADD(1) /
                \ ___  V3:ADD(1) <- V5:REMOVE(5)
    */

		const cro1 = obj1.cro as AddWinsSet<number>;
		const cro2 = obj2.cro as AddWinsSet<number>;

		cro1.add(1);
		merge(obj2, obj1.hashGraph.getAllVertices());

		cro1.remove(1);
		cro2.add(1);
		cro1.add(10);
		cro2.remove(5);
		merge(obj1, obj2.hashGraph.getAllVertices());
		merge(obj2, obj1.hashGraph.getAllVertices());

		expect(cro1.contains(1)).toBe(true);
		expect(cro1.contains(10)).toBe(true);
		expect(cro1.contains(5)).toBe(false);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearOps = obj1.hashGraph.linearizeOperations();
		expect(linearOps).toEqual([
			{ type: "add", value: 1 },
			{ type: "add", value: 1 },
			{ type: "remove", value: 5 },
			{ type: "add", value: 10 },
		]);
	});

	test("Test: Yuta Papa's Case", () => {
		/*
                  ___  V2:REMOVE(1) <- V4:ADD(2)
      V1:ADD(1) /
                \ ___  V3:REMOVE(2) <- V5:ADD(1)
    */

		const cro1 = obj1.cro as AddWinsSet<number>;
		const cro2 = obj2.cro as AddWinsSet<number>;

		cro1.add(1);
		merge(obj2, obj1.hashGraph.getAllVertices());

		cro1.remove(1);
		cro2.remove(2);
		cro1.add(2);
		cro2.add(1);
		merge(obj1, obj2.hashGraph.getAllVertices());
		merge(obj2, obj1.hashGraph.getAllVertices());

		expect(cro1.contains(1)).toBe(true);
		expect(cro1.contains(2)).toBe(true);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearOps = obj1.hashGraph.linearizeOperations();
		expect(linearOps).toEqual([
			{ type: "add", value: 1 },
			{ type: "add", value: 1 },
			{ type: "add", value: 2 },
		]);
	});

	test("Test: Mega Complex Case", () => {
		/*
                                               __ V6:ADD(3)
                                             /
                  ___  V2:ADD(1) <-- V3:RM(2) <-- V7:RM(1) <-- V8:RM(3)
                /                              ______________/
      V1:ADD(1)/                              /
               \                             /
                \ ___  V4:RM(2) <-- V5:ADD(2) <-- V9:RM(1)
    */

		const cro1 = obj1.cro as AddWinsSet<number>;
		const cro2 = obj2.cro as AddWinsSet<number>;
		const cro3 = obj3.cro as AddWinsSet<number>;

		cro1.add(1);
		merge(obj2, obj1.hashGraph.getAllVertices());

		cro1.add(1);
		cro1.remove(2);
		cro2.remove(2);
		cro2.add(2);

		merge(obj3, obj1.hashGraph.getAllVertices());
		cro3.add(3);
		cro1.remove(1);

		merge(obj1, obj2.hashGraph.getAllVertices());
		cro1.remove(3);
		cro2.remove(1);

		merge(obj1, obj2.hashGraph.getAllVertices());
		merge(obj1, obj3.hashGraph.getAllVertices());
		merge(obj2, obj1.hashGraph.getAllVertices());
		merge(obj2, obj3.hashGraph.getAllVertices());
		merge(obj3, obj1.hashGraph.getAllVertices());
		merge(obj3, obj2.hashGraph.getAllVertices());

		expect(cro1.contains(1)).toBe(false);
		expect(cro1.contains(2)).toBe(true);
		expect(cro1.contains(3)).toBe(true);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);
		expect(obj1.hashGraph.vertices).toEqual(obj3.hashGraph.vertices);

		const linearOps = obj1.hashGraph.linearizeOperations();
		expect(linearOps).toEqual([
			{ type: "add", value: 1 },
			{ type: "remove", value: 2 },
			{ type: "add", value: 2 },
			{ type: "add", value: 1 },
			{ type: "add", value: 3 },
			{ type: "remove", value: 1 },
		]);
	});

	test("Test: Mega Complex Case 1", () => {
		/*
                                               __ V5:ADD(3)
                                             /
                  ___  V2:ADD(1) <-- V3:RM(2) <-- V6:RM(1) <-- V8:RM(3)
                /                                       ^
      V1:ADD(1)/                                         \
               \                                          \
                \ ___  V4:RM(2) <-------------------- V7:ADD(2) <-- V9:RM(1)
    */

		const cro1 = obj1.cro as AddWinsSet<number>;
		const cro2 = obj2.cro as AddWinsSet<number>;
		const cro3 = obj3.cro as AddWinsSet<number>;

		cro1.add(1);
		merge(obj2, obj1.hashGraph.getAllVertices());

		cro1.add(1);
		cro1.remove(2);
		cro2.remove(2);

		merge(obj3, obj1.hashGraph.getAllVertices());
		cro3.add(3);
		cro1.remove(1);

		merge(obj2, obj1.hashGraph.getAllVertices());
		cro2.add(2);
		cro1.remove(3);
		cro2.remove(1);

		merge(obj1, obj2.hashGraph.getAllVertices());
		merge(obj1, obj3.hashGraph.getAllVertices());
		merge(obj2, obj1.hashGraph.getAllVertices());
		merge(obj2, obj3.hashGraph.getAllVertices());
		merge(obj3, obj1.hashGraph.getAllVertices());
		merge(obj3, obj2.hashGraph.getAllVertices());

		expect(cro1.contains(1)).toBe(false);
		expect(cro1.contains(2)).toBe(true);
		expect(cro1.contains(3)).toBe(true);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);
		expect(obj1.hashGraph.vertices).toEqual(obj3.hashGraph.vertices);

		const linearOps = obj1.hashGraph.linearizeOperations();
		expect(linearOps).toEqual([
			{ type: "add", value: 1 },
			{ type: "remove", value: 2 },
			{ type: "add", value: 1 },
			{ type: "remove", value: 2 },
			{ type: "add", value: 3 },
			{ type: "remove", value: 1 },
			{ type: "add", value: 2 },
			{ type: "remove", value: 1 },
		]);
	});

	test("Test: Joao's latest brain teaser", () => {
		/*
                 __ V2:Add(2) <------------\
      V1:Add(1) /                           \ - V5:RM(2)
                \__ V3:RM(2) <- V4:RM(2) <--/
    */

		const cro1 = obj1.cro as AddWinsSet<number>;
		const cro2 = obj2.cro as AddWinsSet<number>;

		cro1.add(1);
		merge(obj2, obj1.hashGraph.getAllVertices());

		cro1.add(2);
		cro2.remove(2);
		cro2.remove(2);
		merge(obj1, obj2.hashGraph.getAllVertices());
		merge(obj2, obj1.hashGraph.getAllVertices());

		cro1.remove(2);
		merge(obj2, obj1.hashGraph.getAllVertices());

		expect(cro1.contains(1)).toBe(true);
		expect(cro1.contains(2)).toBe(false);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearOps = obj1.hashGraph.linearizeOperations();
		expect(linearOps).toEqual([
			{ type: "add", value: 1 },
			{ type: "add", value: 2 },
			{ type: "remove", value: 2 },
		]);
	});
});
