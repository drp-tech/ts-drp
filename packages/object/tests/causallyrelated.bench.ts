import { SetDRP } from "@ts-drp/blueprints";
import { type Hash } from "@ts-drp/types";
import { bench, describe } from "vitest";

import { DRPObject } from "../src/index.js";

describe("AreCausallyDependent benchmark", async () => {
	const samples = 100000;
	const tests: Hash[][] = [];

	const obj1 = new DRPObject({
		peerId: "peer1",
		drp: new SetDRP<number>(),
	});
	const obj2 = new DRPObject({
		peerId: "peer2",
		drp: new SetDRP<number>(),
	});
	const obj3 = new DRPObject({
		peerId: "peer3",
		drp: new SetDRP<number>(),
	});

	const drp1 = obj1.drp as SetDRP<number>;
	const drp2 = obj2.drp as SetDRP<number>;
	const drp3 = obj3.drp as SetDRP<number>;

	drp1.add(1);
	await obj2.merge(obj1.hashGraph.getAllVertices());

	drp1.add(1);
	drp1.delete(2);
	drp2.delete(2);
	drp2.add(2);

	await obj3.merge(obj1.hashGraph.getAllVertices());
	drp3.add(3);
	drp1.delete(1);

	await obj1.merge(obj2.hashGraph.getAllVertices());
	drp1.delete(3);
	drp2.delete(1);

	await obj1.merge(obj2.hashGraph.getAllVertices());
	await obj1.merge(obj3.hashGraph.getAllVertices());

	const vertices = obj1.hashGraph.getAllVertices();
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
