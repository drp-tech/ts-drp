import { HashGraph } from "@ts-drp/object";
import { DrpType } from "@ts-drp/types";
import { parseSnapshotFromFile } from "@ts-drp/utils/heap-snapshot";
import { writeHeapSnapshot } from "v8";

// Command line arguments
const NUMBER_OF_VERTICES = Number.parseInt(process.argv[2], 10) || 1000;
const NUMBER_OF_ITERATIONS = Number.parseInt(process.argv[3], 10) || 5;

// Define node structure type
interface NodeInfo {
	name: string;
	selfSize: number;
	id: number;
}

interface BenchmarkResult {
	memoryDifference: number;
	memoryPerVertex: number;
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
		memoryPerVertex: (afterTotalRetained - beforeTotalRetained) / numVertices,
		nodesDifference: afterSnapshot.nodes.length - beforeSnapshot.nodes.length,
		edgesDifference: afterSnapshot.edges.length - beforeSnapshot.edges.length,
	};
}

/**
 * Calculates standard deviation of an array of numbers
 */
function calculateStdDev(values: number[]): number {
	const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
	const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
	const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
	return Math.sqrt(avgSquareDiff);
}

/**
 * Format a number with its standard deviation as percentage
 * @param avg Average value
 * @param stdDev Standard deviation
 * @returns Formatted string with value and percentage deviation
 */
function formatWithPercentageStdDev(avg: number, unit: string, stdDev: number): string {
	// Calculate std dev as percentage of the mean
	const percentStdDev = (stdDev / Math.abs(avg)) * 100;
	return `${avg.toFixed(2)} ${unit} ±${percentStdDev.toFixed(2)}%`;
}

/**
 * Runs multiple iterations of the memory benchmark and calculates statistics
 */
async function memoryBenchmarkForHashGraph(name: string, numVertices: number, iterations: number): Promise<void> {
	// console.log(`Running memory benchmark for ${name} with ${numVertices} vertices (${iterations} iterations)`);

	const results: BenchmarkResult[] = [];

	for (let i = 0; i < iterations; i++) {
		// console.log(`\nIteration ${i + 1}/${iterations}`);
		const result = await runMemoryBenchmark(numVertices);
		results.push(result);
		// console.log(`Memory usage: ${result.memoryDifference} bytes (${result.memoryPerVertex} bytes per vertex)`);
	}

	// Calculate averages and standard deviations
	const memoryPerVertex = results.map((r) => r.memoryPerVertex);

	const avgMemoryPerVertex = memoryPerVertex.reduce((sum, val) => sum + val, 0) / iterations;
	const stdDevMemoryPerVertex = calculateStdDev(memoryPerVertex);

	// Display results
	// console.log("\n=== HashGraph Memory Benchmark Results ===");
	// console.log(`Vertices: ${numVertices}, Iterations: ${iterations}`);
	// console.log(`\nTotal memory usage: ${formatWithPercentageStdDev(avgMemoryDiff, stdDevMemoryDiff)} bytes`);
	// console.log(`Memory per vertex: ${formatWithPercentageStdDev(avgMemoryPerVertex, stdDevMemoryPerVertex)} bytes`);
	// console.log(`New nodes created: ${formatWithPercentageStdDev(avgNodesDiff, stdDevNodesDiff)}`);
	// console.log(`New edges created: ${formatWithPercentageStdDev(avgEdgesDiff, stdDevEdgesDiff)}`);

	// Raw data for further analysis
	// console.log("\nRaw data for each iteration:");
	// results.forEach((result, i) => {
	// 	console.log(`Iteration ${i + 1}: ${result.memoryDifference} bytes, ${result.memoryPerVertex} bytes/vertex`);
	// });

	// Print in Benchmark.js format
	console.log(
		`${name} x ${formatWithPercentageStdDev(avgMemoryPerVertex, "bytes", stdDevMemoryPerVertex)} (${NUMBER_OF_ITERATIONS} runs sampled)`
	);
}

// Run benchmark
void memoryBenchmarkForHashGraph(
	`HashGraph memory benchmark with ${NUMBER_OF_VERTICES} vertices`,
	NUMBER_OF_VERTICES,
	NUMBER_OF_ITERATIONS
);
