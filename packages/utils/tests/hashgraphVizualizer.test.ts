import {
	ActionType,
	DrpType,
	type Hash,
	type IBitSet,
	type IHashGraph,
	Operation,
	SemanticsType,
	Vertex,
} from "@ts-drp/types";
import { beforeEach, describe, expect, test } from "vitest";

import { HashGraphVisualizer } from "../src/debug/hashgraph-visualizer.js";

class MockHashGraph implements IHashGraph {
	peerId: string;
	vertices: Map<Hash, Vertex> = new Map();
	frontier: Hash[] = [];
	forwardEdges: Map<Hash, Hash[]> = new Map();
	semanticsTypeDRP?: SemanticsType;

	static readonly rootHash: Hash = "root";

	constructor(peerId: string, semanticsTypeDRP?: SemanticsType) {
		this.peerId = peerId;
		this.semanticsTypeDRP = semanticsTypeDRP;

		// Initialize with root vertex
		const rootVertex = Vertex.create({
			hash: MockHashGraph.rootHash,
			peerId: "",
			operation: Operation.create({ drpType: "", opType: "NOP", value: null }),
			dependencies: [],
			timestamp: -1,
			signature: new Uint8Array(),
		});
		this.vertices.set(MockHashGraph.rootHash, rootVertex);
		this.frontier.push(MockHashGraph.rootHash);
		this.forwardEdges.set(MockHashGraph.rootHash, []);
	}

	resolveConflictsACL(_vertices: Vertex[]): { action: ActionType } {
		return { action: ActionType.Nop };
	}

	resolveConflictsDRP(_vertices: Vertex[]): { action: ActionType } {
		return { action: ActionType.Nop };
	}

	resolveConflicts(_vertices: Vertex[]): { action: ActionType } {
		return { action: ActionType.Nop };
	}

	createVertex(operation: Operation, dependencies: Hash[], timestamp: number): Vertex {
		const hash = `v${timestamp}`;
		return {
			hash,
			peerId: this.peerId,
			operation,
			dependencies,
			timestamp,
			signature: new Uint8Array(),
		};
	}

	addVertex(vertex: Vertex): void {
		this.vertices.set(vertex.hash, vertex);
		this.frontier.push(vertex.hash);

		// Update forward edges
		for (const dep of vertex.dependencies) {
			if (!this.forwardEdges.has(dep)) {
				this.forwardEdges.set(dep, []);
			}
			this.forwardEdges.get(dep)?.push(vertex.hash);
		}

		// Update frontier by removing dependencies
		const depsSet = new Set(vertex.dependencies);
		this.frontier = this.frontier.filter((hash) => !depsSet.has(hash));
	}

	getFrontier(): Hash[] {
		return this.frontier;
	}

	getDependencies(vertexHash: Hash): Hash[] {
		return this.vertices.get(vertexHash)?.dependencies || [];
	}

	getVertex(hash: Hash): Vertex | undefined {
		return this.vertices.get(hash);
	}

	getAllVertices(): Vertex[] {
		return Array.from(this.vertices.values());
	}

	// These methods are not needed for visualization tests
	areCausallyRelatedUsingBitsets(): boolean {
		return false;
	}
	swapReachablePredecessors(): void {}
	areCausallyRelatedUsingBFS(): boolean {
		return false;
	}
	getReachablePredecessors(): IBitSet | undefined {
		return undefined;
	}
	getCurrentBitsetSize(): number {
		return 0;
	}
}

describe("hashGraphVizualizer tests", () => {
	let hashgraph: IHashGraph;
	const visualizer = new HashGraphVisualizer();

	beforeEach(() => {
		hashgraph = new MockHashGraph("test-peer", SemanticsType.pair);
	});

	test("Should visualize empty graph", () => {
		// Capture console.log output
		const output = visualizer.stringify(hashgraph);
		expect(output).toBeDefined();
		expect(typeof output).toBe("string");
		expect(output).toBe("");
	});

	test("should visualize simple linear graph", () => {
		// Create a simple chain: root -> v1 -> v2
		const vertex1 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [0] }),
			[MockHashGraph.rootHash], // Explicitly depend on root
			1
		);
		hashgraph.addVertex(vertex1);

		const vertex2 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [0] }),
			[vertex1.hash], // Explicitly depend on v1
			2
		);
		hashgraph.addVertex(vertex2);

		// Debug: Print graph structure
		console.log("Vertices:", Array.from(hashgraph.vertices.keys()));
		console.log("Forward edges:", Object.fromEntries(hashgraph.forwardEdges));
		console.log("Dependencies:", {
			[vertex1.hash]: vertex1.dependencies,
			[vertex2.hash]: vertex2.dependencies,
		});

		const output = visualizer.stringify(hashgraph);

		// Get the visualization output
		expect(output).toBeDefined();
		expect(typeof output).toBe("string");

		// Verify vertices are present
		expect(output).toContain(MockHashGraph.rootHash);
		expect(output).toContain(vertex1.hash);
		expect(output).toContain(vertex2.hash);

		// Verify structure
		expect(output).toMatch(/[┌┐└┘]/); // Box characters
		expect(output).toContain("v"); // Arrow

		// Print the actual visualization for debugging
		console.log("Visualization output:");
		console.log(output);
		const expected = `┌───────────┐
│root...root│
└───────────┘
      │
      v
┌───────────┐
│  v1...v1  │
└───────────┘
      │
      v
┌───────────┐
│  v2...v2  │
└───────────┘
`;

		expect(output).toBe(expected);
	});

	test("should visualize complex graph with multiple edges and layers", () => {
		/*
		Create a graph structure like this:
		       v1   v2
		      /  \ /  \
		root      v4   v5
		      \  / \  /
		       v3   v6
		*/

		// First layer
		const vertex1 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [1] }),
			[MockHashGraph.rootHash],
			1
		);
		hashgraph.addVertex(vertex1);

		const vertex2 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [2] }),
			[MockHashGraph.rootHash],
			2
		);
		hashgraph.addVertex(vertex2);

		const vertex3 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [3] }),
			[MockHashGraph.rootHash],
			3
		);
		hashgraph.addVertex(vertex3);

		// Second layer
		const vertex4 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [4] }),
			[vertex1.hash, vertex3.hash],
			4
		);
		hashgraph.addVertex(vertex4);

		// Third layer
		const vertex5 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [5] }),
			[vertex2.hash, vertex4.hash],
			5
		);
		hashgraph.addVertex(vertex5);

		const vertex6 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [6] }),
			[vertex3.hash, vertex4.hash],
			6
		);
		hashgraph.addVertex(vertex6);

		// Debug: Print graph structure
		console.log("Vertices:", Array.from(hashgraph.vertices.keys()));
		console.log("Forward edges:", Object.fromEntries(hashgraph.forwardEdges));
		console.log("Dependencies:", {
			[vertex1.hash]: vertex1.dependencies,
			[vertex2.hash]: vertex2.dependencies,
			[vertex3.hash]: vertex3.dependencies,
			[vertex4.hash]: vertex4.dependencies,
			[vertex5.hash]: vertex5.dependencies,
			[vertex6.hash]: vertex6.dependencies,
		});

		const output = visualizer.stringify(hashgraph);

		const expected = `┌───────────┐
│root...root│
└───────────┘
      │
      v────────────────v────────────────v
┌───────────┐    ┌───────────┐    ┌───────────┐
│  v1...v1  │    │  v2...v2  │    │  v3...v3  │
└───────────┘    └───────────┘    └───────────┘
      │                │                │
      v────────────────│────────────────│
┌───────────┐          │                │
│  v4...v4  │          │                │
└───────────┘          │                │
      │                │                │
      v────────────────v─────────────────
┌───────────┐    ┌───────────┐
│  v5...v5  │    │  v6...v6  │
└───────────┘    └───────────┘
`;

		// Get the visualization output
		expect(output).toBeDefined();
		expect(typeof output).toBe("string");
		expect(output).toBe(expected);
		// Verify all vertices are present
		const vertices = [
			MockHashGraph.rootHash,
			vertex1.hash,
			vertex2.hash,
			vertex3.hash,
			vertex4.hash,
			vertex5.hash,
			vertex6.hash,
		];
		vertices.forEach((hash) => {
			expect(output).toContain(hash);
		});

		// Verify the layered structure
		const lines = output.split("\n");

		// Find y-positions of vertices in the output
		const vertexPositions = new Map<string, number>();
		lines.forEach((line, y) => {
			vertices.forEach((hash) => {
				if (line.includes(hash)) {
					vertexPositions.set(hash, y);
				}
			});
		});

		// Verify layer ordering
		const v4y = vertexPositions.get(vertex4.hash);
		const v5y = vertexPositions.get(vertex5.hash);
		const v6y = vertexPositions.get(vertex6.hash);

		if (v4y === undefined || v5y === undefined || v6y === undefined) {
			throw new Error("Missing vertex positions in output");
		}

		expect(vertexPositions.get(vertex1.hash)).toBeLessThan(v4y);
		expect(vertexPositions.get(vertex2.hash)).toBeLessThan(v5y);
		expect(vertexPositions.get(vertex3.hash)).toBeLessThan(v4y);
		expect(vertexPositions.get(vertex4.hash)).toBeLessThan(v5y);
		expect(vertexPositions.get(vertex4.hash)).toBeLessThan(v6y);

		// Verify edge characters are present
		expect(output).toMatch(/[│─]/); // Vertical and horizontal lines
		expect(output).toContain("v"); // Arrows

		// Print the actual visualization for debugging
		console.log("Visualization output:");
		console.log(output);
	});

	test("should maintain correct topological order in visualization", () => {
		/*
		Create a graph with multiple paths to test topological sort:
		    v1 --> v3
		  /  \     ^
		root  v2 --/
		  \  /
		   v4
		*/

		// Create vertices
		const vertex1 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [1] }),
			[MockHashGraph.rootHash],
			1
		);
		hashgraph.addVertex(vertex1);

		const vertex2 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [2] }),
			[vertex1.hash],
			2
		);
		hashgraph.addVertex(vertex2);

		const vertex4 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [4] }),
			[MockHashGraph.rootHash],
			4
		);
		hashgraph.addVertex(vertex4);

		const vertex3 = hashgraph.createVertex(
			Operation.create({ drpType: DrpType.DRP, opType: "test", value: [3] }),
			[vertex2.hash],
			3
		);
		hashgraph.addVertex(vertex3);

		const output = visualizer.stringify(hashgraph);
		const lines = output.split("\n");

		// Find y-positions of vertices in the output
		const vertexPositions = new Map<string, number>();
		lines.forEach((line, y) => {
			[MockHashGraph.rootHash, vertex1.hash, vertex2.hash, vertex3.hash, vertex4.hash].forEach((hash) => {
				if (line.includes(hash)) {
					vertexPositions.set(hash, y);
				}
			});
		});

		// Verify topological ordering through y-positions
		const rootY = vertexPositions.get(MockHashGraph.rootHash);
		const v1Y = vertexPositions.get(vertex1.hash);
		const v2Y = vertexPositions.get(vertex2.hash);
		const v3Y = vertexPositions.get(vertex3.hash);
		const v4Y = vertexPositions.get(vertex4.hash);

		if (!rootY || !v1Y || !v2Y || !v3Y || !v4Y) {
			throw new Error("Missing vertex positions in output");
		}

		// Root should be above its dependencies
		expect(rootY).toBeLessThan(v1Y);
		expect(rootY).toBeLessThan(v4Y);

		// v1 should be above v2 and v3
		expect(v1Y).toBeLessThan(v2Y);
		expect(v1Y).toBeLessThan(v3Y);

		// v2 should be above v3
		expect(v2Y).toBeLessThan(v3Y);

		// Verify edge characters
		expect(output).toMatch(/[│─]/); // Vertical and horizontal lines
		expect(output).toContain("v"); // Arrows

		// Print the actual visualization for debugging
		console.log("Visualization output:");
		console.log(output);

		const expected = `┌───────────┐
│root...root│
└───────────┘
      │
      v────────────────v
┌───────────┐    ┌───────────┐
│  v1...v1  │    │  v4...v4  │
└───────────┘    └───────────┘
      │
      v
┌───────────┐
│  v2...v2  │
└───────────┘
      │
      v
┌───────────┐
│  v3...v3  │
└───────────┘
`;

		expect(output).toBe(expected);
	});
});
