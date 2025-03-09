/* eslint-disable @typescript-eslint/no-explicit-any */
import Benchmark from "benchmark";

import { deserializeValue, serializeValue } from "../src/utils/serializer.js";
function createNestedObject(depth: number, breadth: number): any {
	if (depth <= 0) {
		return {
			num: Math.random(),
			str: "test",
			date: new Date(),
			set: new Set([1, 2, 3]),
			map: new Map([
				["a", 1],
				["b", 2],
			]),
			array: new Uint8Array([1, 2, 3, 4]),
			float: new Float32Array([1.1, 2.2, 3.3]),
		};
	}
	const obj: any = {};
	for (let i = 0; i < breadth; i++) {
		obj[`child${i}`] = createNestedObject(depth - 1, breadth);
	}
	return obj;
}

const suite = new Benchmark.Suite();
function benchmarkSerializeValue(depth: number, breadth: number): Benchmark.Suite {
	return suite.add(`Serialize ${depth} depth ${breadth} breadth`, () => {
		// Create a deeply nested structure
		// Create test data with depth=5 and breadth=3
		// This creates 3^5 = 243 leaf nodes, each with 7 complex properties
		const deepObject = createNestedObject(depth, breadth);
		// Warm up
		for (let i = 0; i < 3; i++) {
			serializeValue(deepObject);
		}
		// Benchmark
		const iterations = 100;
		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			serializeValue(deepObject);
		}
		const end = performance.now();
		const avgMs = (end - start) / iterations;
		const leaf = Math.pow(depth, breadth);
		console.log(`Average serialization time: ${avgMs.toFixed(2)}ms`);
		console.log(`Object stats:
			- Depth: ${depth}
			- Breadth: ${breadth}
			- Leaf nodes: ${leaf}
			- Complex properties per leaf: 7
			- Total complex values: ${leaf * 7}
	 `);
	});
}

benchmarkSerializeValue(5, 5);

suite
	.on("cycle", (event: Benchmark.Event) => {
		console.log(String(event.target));
	})
	.on("complete", function (this: Benchmark.Suite) {
		console.log(`Fastest is ${this.filter("fastest").map("name")}`);
	})
	.run({ async: true });

function benchmarkDeserializeValue(depth: number, breadth: number): Benchmark.Suite {
	return suite.add(`Deserialize ${depth} depth ${breadth} breadth`, () => {
		// Create a deeply nested structure
		// Create test data with depth=5 and breadth=3
		// This creates 3^5 = 243 leaf nodes, each with 7 complex properties
		const deepObject = createNestedObject(depth, breadth);
		const serialized = serializeValue(deepObject);
		// Warm up
		for (let i = 0; i < 3; i++) {
			deserializeValue(serialized);
		}
		// Benchmark
		const iterations = 100;
		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			deserializeValue(serialized);
		}
		const end = performance.now();
		const avgMs = (end - start) / iterations;
		const leaf = Math.pow(depth, breadth);
		console.log(`Average deserialization time: ${avgMs.toFixed(2)}ms`);
		console.log(`Object stats:
			- Depth: ${depth}
			- Breadth: ${breadth}
			- Leaf nodes: ${leaf}
			- Complex properties per leaf: 7
			- Total complex values: ${leaf * 7}
	 `);
	});
}

benchmarkDeserializeValue(5, 5);

suite
	.on("cycle", (event: Benchmark.Event) => {
		console.log(String(event.target));
	})
	.on("complete", function (this: Benchmark.Suite) {
		console.log(`Fastest is ${this.filter("fastest").map("name")}`);
	})
	.run({ async: true });
