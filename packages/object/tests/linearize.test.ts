import { ActionType, DrpType, Operation, SemanticsType, type Vertex } from "@ts-drp/types";
import { ObjectSet } from "@ts-drp/utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createVertex, HashGraph } from "../src/hashgraph/index.js";
import { linearizeMultipleSemantics } from "../src/linearize/multipleSemantics.js";
import { linearizePairSemantics } from "../src/linearize/pairSemantics.js";

describe("Linearize correctly", () => {
	test("should linearize correctly with multiple semantics", () => {
		vi.useFakeTimers({ now: 0 });
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
				createVertex(
					"",
					Operation.create({ opType: "test", value: [i], drpType: DrpType.DRP }),
					frontier,
					Date.now(),
					new Uint8Array()
				)
			);
			hashgraph.addVertex(
				createVertex(
					"",
					Operation.create({ opType: "test", value: [i + 1], drpType: DrpType.DRP }),
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
		const expectedOrder = [1, 0, 2, 3, 5, 4, 6, 7, 9, 8];
		const receivedOrder = order.map((vertex) => vertex.operation?.value[0]);
		expect(receivedOrder).toStrictEqual(expectedOrder);
	});

	test("should linearize correctly with pair semantics", () => {
		vi.useFakeTimers({ now: 0 });
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
				createVertex(
					"",
					Operation.create({ opType: "test", value: [i], drpType: DrpType.DRP }),
					[frontier[0]],
					Date.now(),
					new Uint8Array()
				)
			);
			hashgraph.addVertex(
				createVertex(
					"",
					Operation.create({ opType: "test", value: [i + 1], drpType: DrpType.DRP }),
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
		const expectedOrder = [4, 0, 2, 6, 8];
		const receivedOrder = order.map((vertex) => vertex.operation?.value[0]);
		expect(receivedOrder).toStrictEqual(expectedOrder);
	});
});

describe("linearizeMultipleSemantics", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: 0 });
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
			createVertex(
				"",
				Operation.create({ opType: "set", value: [1], drpType: DrpType.DRP }),
				hashGraph.getFrontier(),
				Date.now(),
				new Uint8Array()
			)
		);

		hashGraph.addVertex(
			createVertex(
				"",
				Operation.create({ opType: "set", value: [2], drpType: DrpType.DRP }),
				hashGraph.getFrontier(),
				Date.now(),
				new Uint8Array()
			)
		);

		const subgraph = new ObjectSet<string>();
		hashGraph.getAllVertices().forEach((vertex) => subgraph.add(vertex.hash));

		const result = linearizeMultipleSemantics(hashGraph, origin, subgraph);
		expect(result.map((vertex) => vertex.operation?.value)).toEqual([[1], [2]]);
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
			createVertex(
				"",
				Operation.create({ opType: "set", value: [1], drpType: DrpType.DRP }),
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);

		hashGraph.addVertex(
			createVertex(
				"",
				Operation.create({ opType: "set", value: [2], drpType: DrpType.DRP }),
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);

		hashGraph.addVertex(
			createVertex(
				"",
				Operation.create({ opType: "set", value: [3], drpType: DrpType.DRP }),
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);

		// Get the frontier
		frontier = hashGraph.getFrontier();

		hashGraph.addVertex(
			createVertex(
				"",
				Operation.create({ opType: "set", value: [4], drpType: DrpType.DRP }),
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);
		hashGraph.addVertex(
			createVertex(
				"",
				Operation.create({ opType: "set", value: [5], drpType: DrpType.DRP }),
				frontier.filter((_, idx) => idx !== 0),
				Date.now(),
				new Uint8Array()
			)
		);

		frontier = hashGraph.getFrontier();

		hashGraph.addVertex(
			createVertex(
				"",
				Operation.create({ opType: "set", value: [6], drpType: DrpType.DRP }),
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);

		const subgraph = new ObjectSet<string>();
		hashGraph.getAllVertices().forEach((vertex) => subgraph.add(vertex.hash));

		const result = linearizeMultipleSemantics(hashGraph, origin, subgraph);
		expect(result.map((vertex) => vertex.operation?.value)).toEqual([[1], [4], [6]]);
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
			createVertex(
				"",
				Operation.create({ opType: "set", value: [1], drpType: DrpType.DRP }),
				hashGraph.getFrontier(),
				Date.now(),
				new Uint8Array()
			)
		);

		hashGraph.addVertex(
			createVertex(
				"",
				Operation.create({ opType: "set", value: [2], drpType: DrpType.DRP }),
				hashGraph.getFrontier(),
				Date.now(),
				new Uint8Array()
			)
		);

		const subgraph = new ObjectSet<string>();
		hashGraph.getAllVertices().forEach((vertex) => subgraph.add(vertex.hash));

		const result = linearizeMultipleSemantics(hashGraph, origin, subgraph);
		expect(result.map((vertex) => vertex.operation?.value)).toEqual([[1], [2]]);
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
				createVertex(
					"",
					Operation.create({ opType: "test", value: [i], drpType: DrpType.DRP }),
					frontier,
					Date.now(),
					new Uint8Array()
				)
			);
			hashGraph.addVertex(
				createVertex(
					"",
					Operation.create({ opType: "test", value: [i + 1], drpType: DrpType.DRP }),
					frontier,
					Date.now(),
					new Uint8Array()
				)
			);
		}

		const subgraph = new ObjectSet<string>(hashGraph.vertices.keys());
		const linearizedVertices = linearizePairSemantics(hashGraph, HashGraph.rootHash, subgraph);
		const order = hashGraph.topologicalSort(true);
		for (let i = 0; i < linearizedVertices.length; i++) {
			expect(linearizedVertices[i]).equal(hashGraph.vertices.get(order[i + 1]));
		}
	});
});
