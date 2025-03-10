import { ActionType, DrpType, SemanticsType, type Vertex } from "@ts-drp/types";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { HashGraph, newVertex } from "../src/index.js";
import { linearizeMultipleSemantics } from "../src/linearize/multipleSemantics.js";
import { linearizePairSemantics } from "../src/linearize/pairSemantics.js";
import { ObjectSet } from "../src/utils/objectSet.js";

describe("Linearize correctly", () => {
	test("should linearize correctly with multiple semantics", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 19)));
		const hashgraph = new HashGraph(
			"",
			(_vertices: Vertex[]) => {
				return {
					action: ActionType.Nop,
				};
			},
			(_vertices: Vertex[]) => {
				return {
					action: ActionType.Nop,
				};
			},
			SemanticsType.multiple
		);
		for (let i = 0; i < 10; i += 2) {
			const frontier = hashgraph.getFrontier();
			hashgraph.addVertex(
				newVertex(
					"",
					{
						opType: "test",
						value: [i],
						drpType: DrpType.DRP,
					},
					frontier,
					Date.now(),
					new Uint8Array()
				)
			);
			hashgraph.addVertex(
				newVertex(
					"",
					{
						opType: "test",
						value: [i + 1],
						drpType: DrpType.DRP,
					},
					frontier,
					Date.now(),
					new Uint8Array()
				)
			);
		}
		const order = linearizeMultipleSemantics(
			hashgraph,
			HashGraph.rootHash,
			new ObjectSet(hashgraph.getAllVertices().map((vertex) => vertex.hash))
		);
		const expectedOrder = [1, 0, 3, 2, 4, 5, 7, 6, 8, 9];
		for (let i = 0; i < 10; i++) {
			expect(order[i].value).toStrictEqual([expectedOrder[i]]);
		}
	});

	test("should linearize correctly with pair semantics", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 19)));
		const hashgraph = new HashGraph(
			"",
			(_vertices: Vertex[]) => {
				return {
					action: ActionType.Nop,
				};
			},
			(_vertices: Vertex[]) => {
				const value = _vertices[0].operation?.value;
				if (value && value[0] % 2) {
					return {
						action: ActionType.DropLeft,
					};
				}
				const value1 = _vertices[1].operation?.value;
				if (value1 && value1[0] % 2) {
					return {
						action: ActionType.DropRight,
					};
				}
				return {
					action: ActionType.Nop,
				};
			},
			SemanticsType.pair
		);
		for (let i = 0; i < 10; i += 2) {
			const frontier = hashgraph.getFrontier();
			hashgraph.addVertex(
				newVertex(
					"",
					{
						opType: "test",
						value: [i],
						drpType: DrpType.DRP,
					},
					[frontier[0]],
					Date.now(),
					new Uint8Array()
				)
			);
			hashgraph.addVertex(
				newVertex(
					"",
					{
						opType: "test",
						value: [i + 1],
						drpType: DrpType.DRP,
					},
					[frontier[0]],
					Date.now(),
					new Uint8Array()
				)
			);
		}
		const order = linearizePairSemantics(
			hashgraph,
			HashGraph.rootHash,
			new ObjectSet(hashgraph.getAllVertices().map((vertex) => vertex.hash))
		);
		const expectedOrder = [4, 0, 8, 2, 6];
		for (let i = 0; i < 5; i++) {
			expect(order[i].value).toStrictEqual([expectedOrder[i]]);
		}
	});
});

describe("linearizeMultipleSemantics", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 19)));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("should linearize operations in a simple sequence", () => {
		const hashGraph = new HashGraph(
			"",
			(_vertices: Vertex[]) => ({
				action: ActionType.Nop,
			}),
			() => ({
				action: ActionType.Nop,
			}),
			SemanticsType.multiple
		);
		const origin = HashGraph.rootHash;

		// Add vertices to the graph
		hashGraph.addVertex(
			newVertex(
				"",
				{
					opType: "set",
					value: [1],
					drpType: DrpType.DRP,
				},
				hashGraph.getFrontier(),
				Date.now(),
				new Uint8Array()
			)
		);

		hashGraph.addVertex(
			newVertex(
				"",
				{
					opType: "set",
					value: [2],
					drpType: DrpType.DRP,
				},
				hashGraph.getFrontier(),
				Date.now(),
				new Uint8Array()
			)
		);

		const subgraph = new ObjectSet<string>();
		hashGraph.getAllVertices().forEach((vertex) => subgraph.add(vertex.hash));

		const result = linearizeMultipleSemantics(hashGraph, origin, subgraph);
		expect(result.map((op) => op.value)).toEqual([[1], [2]]);
	});

	test("should handle concurrent operations with conflict resolution", () => {
		const hashGraph = new HashGraph(
			"",
			(_vertices: Vertex[]) => ({
				action: ActionType.Drop,
				vertices: _vertices.filter((_, index) => index !== 0).map((vertex) => vertex.hash),
			}),
			(_vertices: Vertex[]) => ({
				action: ActionType.Drop,
				vertices: _vertices.filter((_, index) => index !== 0).map((vertex) => vertex.hash),
			}),
			SemanticsType.multiple
		);
		const origin = HashGraph.rootHash;
		let frontier = hashGraph.getFrontier();

		// Add concurrent vertices
		hashGraph.addVertex(
			newVertex(
				"",
				{
					opType: "set",
					value: [1],
					drpType: DrpType.DRP,
				},
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);

		hashGraph.addVertex(
			newVertex(
				"",
				{
					opType: "set",
					value: [2],
					drpType: DrpType.DRP,
				},
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);

		hashGraph.addVertex(
			newVertex(
				"",
				{
					opType: "set",
					value: [3],
					drpType: DrpType.DRP,
				},
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);

		// Get the frontier
		frontier = hashGraph.getFrontier();

		hashGraph.addVertex(
			newVertex(
				"",
				{
					opType: "set",
					value: [4],
					drpType: DrpType.DRP,
				},
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);
		hashGraph.addVertex(
			newVertex(
				"",
				{
					opType: "set",
					value: [5],
					drpType: DrpType.DRP,
				},
				frontier.filter((_, idx) => idx !== 0),
				Date.now(),
				new Uint8Array()
			)
		);

		frontier = hashGraph.getFrontier();

		hashGraph.addVertex(
			newVertex(
				"",
				{
					opType: "set",
					value: [6],
					drpType: DrpType.DRP,
				},
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);

		const subgraph = new ObjectSet<string>();
		hashGraph.getAllVertices().forEach((vertex) => subgraph.add(vertex.hash));

		const result = linearizeMultipleSemantics(hashGraph, origin, subgraph);
		expect(result.map((op) => op.value)).toEqual([[3], [5], [6]]);
	});

	test("should handle operations with null values", () => {
		const hashGraph = new HashGraph(
			"",
			() => ({
				action: ActionType.Nop,
			}),
			() => ({
				action: ActionType.Nop,
			}),
			SemanticsType.multiple
		);
		const origin = HashGraph.rootHash;

		// Add vertices to the graph
		hashGraph.addVertex(
			newVertex(
				"",
				{
					opType: "set",
					value: null,
					drpType: DrpType.DRP,
				},
				hashGraph.getFrontier(),
				Date.now(),
				new Uint8Array()
			)
		);

		hashGraph.addVertex(
			newVertex(
				"",
				{
					opType: "set",
					value: [2],
					drpType: DrpType.DRP,
				},
				hashGraph.getFrontier(),
				Date.now(),
				new Uint8Array()
			)
		);

		const subgraph = new ObjectSet<string>();
		hashGraph.getAllVertices().forEach((vertex) => subgraph.add(vertex.hash));

		const result = linearizeMultipleSemantics(hashGraph, origin, subgraph);
		expect(result.map((op) => op.value)).toEqual([[2]]);
	});

	test("should handle empty subgraph", () => {
		const hashGraph = new HashGraph(
			"",
			() => ({
				action: ActionType.Nop,
			}),
			() => ({
				action: ActionType.Nop,
			}),
			SemanticsType.multiple
		);
		const origin = HashGraph.rootHash;

		const subgraph = new ObjectSet<string>();
		subgraph.add(origin);

		const result = linearizeMultipleSemantics(hashGraph, origin, subgraph);
		expect(result).toEqual([]);
	});

	test("Should return in topological order when the resolveConflicts function is undefined", () => {
		const hashGraph = new HashGraph("", undefined, undefined, SemanticsType.pair);
		for (let i = 0; i < 100; i += 2) {
			const frontier = hashGraph.getFrontier();
			hashGraph.addVertex(
				newVertex(
					"",
					{
						opType: "test",
						value: [i],
						drpType: DrpType.DRP,
					},
					frontier,
					Date.now(),
					new Uint8Array()
				)
			);
			hashGraph.addVertex(
				newVertex(
					"",
					{
						opType: "test",
						value: [i + 1],
						drpType: DrpType.DRP,
					},
					frontier,
					Date.now(),
					new Uint8Array()
				)
			);
		}

		const subgraph = new ObjectSet<string>(hashGraph.vertices.keys());
		const linearizedOps = linearizePairSemantics(hashGraph, HashGraph.rootHash, subgraph);
		const order = hashGraph.topologicalSort(true);
		for (let i = 0; i < linearizedOps.length; i++) {
			expect(linearizedOps[i]).equal(hashGraph.vertices.get(order[i + 1])?.operation);
		}
	});
});
