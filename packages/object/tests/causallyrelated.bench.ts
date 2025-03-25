import { SetDRP } from "@ts-drp/blueprints";
import { type Hash } from "@ts-drp/types";
import { bench, describe } from "vitest";

import { DRPObject2 } from "../src/index.js";

describe("AreCausallyDependent benchmark", async () => {
	const samples = 100000;
	const tests: Hash[][] = [];

	const obj1 = new DRPObject2({
		peerId: "peer1",
		drp: new SetDRP<number>(),
	});
	const obj2 = new DRPObject2({
		peerId: "peer2",
		drp: new SetDRP<number>(),
	});
	const obj3 = new DRPObject2({
		peerId: "peer3",
		drp: new SetDRP<number>(),
	});

	obj1.drp?.add(1);
	await obj2.merge(obj1.vertices);

	obj1.drp?.add(1);
	obj1.drp?.delete(2);
	obj2.drp?.delete(2);
	obj2.drp?.add(2);

	await obj3.merge(obj1.vertices);
	obj3.drp?.add(3);
	obj1.drp?.delete(1);

	await obj1.merge(obj2.vertices);
	obj1.drp?.delete(3);
	obj2.drp?.delete(1);

	await obj1.merge(obj2.vertices);
	await obj1.merge(obj3.vertices);

	const vertices = obj1.vertices;
	for (let i = 0; i < samples; i++) {
		tests.push([
			vertices[Math.floor(Math.random() * vertices.length)].hash,
			vertices[Math.floor(Math.random() * vertices.length)].hash,
		]);
	}

	bench("Causality check using BFS", () => {
		for (let i = 0; i < samples; i++) {
			obj1.hashGraph.areCausallyRelatedUsingBFS(tests[i][0], tests[i][1]);
		}
	});

	bench("Causality check using Bitsets", () => {
		for (let i = 0; i < samples; i++) {
			obj1.hashGraph.areCausallyRelatedUsingBitsets(tests[i][0], tests[i][1]);
		}
	});
});
