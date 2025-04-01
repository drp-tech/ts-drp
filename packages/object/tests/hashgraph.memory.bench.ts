import { HashGraph } from "@ts-drp/object";
import { DrpType } from "@ts-drp/types";
import { formatOutput, parseSnapshotFromFile } from "@ts-drp/utils/memory-benchmark";
import { writeHeapSnapshot } from "v8";

const NUMBER_OF_ITERATIONS = Number.parseInt(process.argv[2], 10) || 5;

// Define node structure type
interface NodeInfo {
	name: string;
	selfSize: number;
	id: number;
}

interface BenchmarkResult {
	memoryDifference: number;
	nodesDifference: number;
	edgesDifference: number;
}

/**
 * Runs memory benchmark for HashGraph with specified number of vertices
 */
async function runMemoryBenchmark(numVertices: number): Promise<BenchmarkResult> {
	if (gc) gc();
	const beforeSnapshotPath = writeHeapSnapshot();

	const hashGraph = new HashGraph("peer1");
	for (let i = 0; i < numVertices; i++) {
		hashGraph.addVertex({
			hash: `hash${i}`,
			dependencies: hashGraph.getFrontier(),
			peerId: `peer${i % 10}`, // Reuse peer IDs to reduce unique strings
			timestamp: Date.now(),
			operation: {
				drpType: DrpType.DRP,
				opType: "add",
				value: i,
			},
			signature: new Uint8Array(32),
		});
	}
	if (gc) gc();
	const afterSnapshotPath = writeHeapSnapshot();

	const beforeSnapshot = await parseSnapshotFromFile(beforeSnapshotPath);
	const afterSnapshot = await parseSnapshotFromFile(afterSnapshotPath);

	// Find HashGraph instances and their sizes
	const hashGraphNodesBefore: NodeInfo[] = [];
	const hashGraphNodesAfter: NodeInfo[] = [];

	beforeSnapshot.nodes.forEach((node) => {
		if (node.name === "HashGraph" || node.name.includes("HashGraph")) {
			hashGraphNodesBefore.push({
				name: node.name,
				selfSize: node.self_size,
				id: node.id,
			});
		}
	});

	afterSnapshot.nodes.forEach((node) => {
		if (node.name === "HashGraph" || node.name.includes("HashGraph")) {
			hashGraphNodesAfter.push({
				name: node.name,
				selfSize: node.self_size,
				id: node.id,
			});
		}
	});

	// Calculate overall memory usage
	let beforeTotalRetained = 0;
	let afterTotalRetained = 0;

	beforeSnapshot.nodes.forEach((node) => (beforeTotalRetained += node.self_size));
	afterSnapshot.nodes.forEach((node) => (afterTotalRetained += node.self_size));

	return {
		memoryDifference: afterTotalRetained - beforeTotalRetained,
		nodesDifference: afterSnapshot.nodes.length - beforeSnapshot.nodes.length,
		edgesDifference: afterSnapshot.edges.length - beforeSnapshot.edges.length,
	};
}

/**
 * Runs multiple iterations of the memory benchmark and calculates statistics
 */
async function memoryBenchmarkForHashGraph(name: string, numVertices: number, iterations: number): Promise<void> {
	const results: BenchmarkResult[] = [];

	for (let i = 0; i < iterations; i++) {
		const result = await runMemoryBenchmark(numVertices);
		results.push(result);
	}

	const memoryDifferences = results.map((r) => r.memoryDifference);

	if (memoryDifferences.length !== iterations) {
		console.error(`Memory benchmark for ${name} failed to complete ${iterations} iterations`);
		return;
	}

	// Print in Benchmark.js format
	console.log(formatOutput(name, memoryDifferences, "MB", 1024 * 1024));
}

// Run benchmark
void (async (): Promise<void> => {
	await memoryBenchmarkForHashGraph(`HashGraph memory benchmark with 1000 vertices`, 1000, NUMBER_OF_ITERATIONS);
	await memoryBenchmarkForHashGraph(`HashGraph memory benchmark with 10000 vertices`, 10000, NUMBER_OF_ITERATIONS);
})();
