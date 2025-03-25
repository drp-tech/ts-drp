import { MapDRP, SetDRP } from "@ts-drp/blueprints";
import Benchmark from "benchmark";

import { DRPObject, ObjectACL } from "../src/index.js";

const acl = new ObjectACL({
	admins: ["peer1"],
});

const NUMBER_OF_OPERATIONS = Number.parseInt(process.argv[2], 10) || 1000;

function benchmarkForAddWinSet(
	name: string,
	numDRPs: number,
	verticesPerDRP: number,
	mergeFn: boolean
): Benchmark.Suite {
	return suite.add(name, async () => {
		const objects: DRPObject<SetDRP<number>>[] = [];
		for (let i = 0; i < numDRPs; i++) {
			const obj = new DRPObject({
				peerId: `peer${i + 1}`,
				acl,
				drp: new SetDRP<number>(),
			});
			for (let j = 0; j < verticesPerDRP; j++) {
				if (i % 3 === 2) {
					obj.drp?.add(j);
					obj.drp?.delete(j);
				} else if (i % 3 === 1) {
					obj.drp?.delete(j);
					obj.drp?.add(j);
				} else {
					obj.drp?.add(j);
				}
			}
			objects.push(obj);
		}

		if (mergeFn) {
			for (let i = 0; i < objects.length; i++) {
				for (let j = 0; j < objects.length; j++) {
					if (i !== j) {
						await objects[i].merge(objects[j].hashGraph.getAllVertices());
					}
				}
			}
		}
	});
}
const suite = new Benchmark.Suite();

benchmarkForAddWinSet(`Create HashGraph with ${NUMBER_OF_OPERATIONS} vertices1`, 1, NUMBER_OF_OPERATIONS, false);

benchmarkForAddWinSet(
	`Create 2 DRP Objects ${NUMBER_OF_OPERATIONS} vertices each) and Merge`,
	2,
	NUMBER_OF_OPERATIONS,
	true
);

suite.add("Create a HashGraph with 1000 operations for set wins map 1000", () => {
	const object = new DRPObject({
		peerId: "peer1",
		acl,
		drp: new MapDRP<number, number>(),
	});
	for (let i = 0; i < 1000; ++i) {
		object.drp?.set(i, i);
	}
});

suite.add(`Create a HashGraph with ${NUMBER_OF_OPERATIONS} operations for set wins map`, () => {
	const object = new DRPObject({
		peerId: "peer1",
		acl,
		drp: new MapDRP<number, number>(),
	});
	for (let i = 0; i < NUMBER_OF_OPERATIONS; ++i) {
		object.drp?.set(i, i);
	}
});

suite.add(`Create a HashGraph with ${NUMBER_OF_OPERATIONS} operations for set wins map and read them`, () => {
	const object = new DRPObject({
		peerId: "peer1",
		acl,
		drp: new MapDRP<number, number>(),
	});
	for (let i = 0; i < NUMBER_OF_OPERATIONS; ++i) {
		object.drp?.set(i, i);
	}

	for (let i = 0; i < NUMBER_OF_OPERATIONS; ++i) {
		object.drp?.query_get(i);
	}
});
suite.add(`Create a HashGraph with ${NUMBER_OF_OPERATIONS} operations for set wins map and delete them`, () => {
	const object = new DRPObject({
		peerId: "peer1",
		acl,
		drp: new MapDRP<number, number>(),
	});
	for (let i = 0; i < NUMBER_OF_OPERATIONS; ++i) {
		object.drp?.set(i, i);
	}

	for (let i = 0; i < NUMBER_OF_OPERATIONS; ++i) {
		object.drp?.delete(i);
	}
});

suite.add(`Create a HashGraph with ${NUMBER_OF_OPERATIONS} operations for set wins map with random operations`, () => {
	const object = new DRPObject({
		peerId: "peer1",
		acl,
		drp: new MapDRP<number, number>(),
	});
	for (let i = 0; i < 250; i += 4) {
		object.drp?.set(i, i);
		if (i % 2 === 0) {
			object.drp?.delete(i);
			object.drp?.set(i, i + 1);
		} else {
			object.drp?.set(i, i + 1);
			object.drp?.delete(i);
		}
		if (i % 2 === 0) {
			object.drp?.query_get(i);
		} else {
			object.drp?.query_has(i);
		}
	}
});

suite.add(
	`Create 2 HashGraphs with ${NUMBER_OF_OPERATIONS} operations each for set wins map and merge with random operations`,
	async () => {
		function initialize(drp?: MapDRP<number, number>): void {
			for (let i = 0; i < 250; i += 4) {
				drp?.set(i, i);
				if (i % 2 === 0) {
					drp?.delete(i);
					drp?.set(i, i + 1);
				} else {
					drp?.set(i, i + 1);
					drp?.delete(i);
				}
				if (i % 2 === 0) {
					drp?.query_get(i);
				} else {
					drp?.query_has(i);
				}
			}
		}

		const object1 = new DRPObject({
			peerId: "peer1",
			acl,
			drp: new MapDRP<number, number>(),
		});
		initialize(object1.drp);

		const object2 = new DRPObject({
			peerId: "peer2",
			acl,
			drp: new MapDRP<number, number>(),
		});
		initialize(object2.drp);

		await object1.merge(object2.hashGraph.getAllVertices());
		await object2.merge(object1.hashGraph.getAllVertices());
	}
);

suite
	.on("cycle", (event: Benchmark.Event) => {
		console.log(String(event.target));
	})
	.on("complete", function (this: Benchmark.Suite) {
		console.log(`Fastest is ${this.filter("fastest").map("name")}`);
	})
	.run({ async: true });
