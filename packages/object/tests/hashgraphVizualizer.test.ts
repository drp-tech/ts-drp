import { describe, test, expect, vi, beforeEach } from "vitest";

import { SemanticsType, ActionType, HashGraph, DrpType } from "../src/index.js";
import { newVertex, type Vertex } from "../src/index.js";
import { HashGraphVizualizer } from "../src/utils/hashgraphVizualizer.js";

describe("hashGraphVizualizer tests", () => {
	let hashgraph: HashGraph;
	const visualizer = new HashGraphVizualizer();

	beforeEach(() => {
		hashgraph = new HashGraph(
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
	});

	test("Should visualize empty graph", () => {
		// Capture console.log output
		const consoleSpy = vi.spyOn(console, "log");
		visualizer.draw(hashgraph);

		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	test("should visualize simple linear graph", () => {
		// Create a linear chain of 3 vertices
		let frontier = hashgraph.getFrontier();
		hashgraph.addVertex(
			newVertex(
				"hash1",
				{
					opType: "test",
					value: new Uint8Array([0]),
					drpType: DrpType.DRP,
				},
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);

		frontier = hashgraph.getFrontier();
		hashgraph.addVertex(
			newVertex(
				"hash2",
				{
					opType: "test",
					value: new Uint8Array([0]),
					drpType: DrpType.DRP,
				},
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);

		frontier = hashgraph.getFrontier();
		hashgraph.addVertex(
			newVertex(
				"hash3",
				{
					opType: "test",
					value: new Uint8Array([0]),
					drpType: DrpType.DRP,
				},
				frontier,
				Date.now(),
				new Uint8Array()
			)
		);
		frontier = hashgraph.getFrontier();
		const consoleSpy = vi.spyOn(console, "log");

		visualizer.draw(hashgraph);

		// Verify the output contains our hashes
		const output = consoleSpy.mock.calls[0][0] as string;
		for (const hash of hashgraph.vertices.keys()) {
			expect(output).toContain(`${hash.slice(0, 4)}...${hash.slice(-4)}`);
		}

		// Verify the structure (boxes and connections)
		expect(output).toContain("┌");
		expect(output).toContain("┐");
		expect(output).toContain("└");
		expect(output).toContain("┘");
		expect(output).toContain("v");

		consoleSpy.mockRestore();
	});
});
