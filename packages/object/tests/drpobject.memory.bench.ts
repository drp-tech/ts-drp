import { SetDRP } from "@ts-drp/blueprints";
import { formatOutput, parseSnapshotFromFile } from "@ts-drp/utils/memory-benchmark";
import { writeHeapSnapshot } from "v8";

import { DRPObject, ObjectACL } from "../src/index.js";

const acl = new ObjectACL({
	admins: ["peer1"],
});

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

	const obj = new DRPObject({
		peerId: "peer1",
		acl,
		drp: new SetDRP<number>(),
	});
	for (let i = 0; i < numVertices; i++) {
		obj.drp?.add(i);
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
async function memoryBenchmarkForDrpObjectWithAddWinsSet(
	name: string,
	numVertices: number,
	iterations: number
): Promise<void> {
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
	await memoryBenchmarkForDrpObjectWithAddWinsSet(
		`DRPObject memory benchmark with 1000 vertices`,
		1000,
		NUMBER_OF_ITERATIONS
	);
	await memoryBenchmarkForDrpObjectWithAddWinsSet(
		`DRPObject memory benchmark with 10000 vertices`,
		10000,
		NUMBER_OF_ITERATIONS
	);
})();
