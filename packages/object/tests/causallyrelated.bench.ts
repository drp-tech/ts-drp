import { SetDRP } from "@ts-drp/blueprints";
import { type Hash } from "@ts-drp/types";
import { bench, describe } from "vitest";

import { createDRPVertexApplier } from "../src/drp-applier.js";

describe("AreCausallyDependent benchmark", async () => {
	const samples = 100000;
	const tests: Hash[][] = [];

	const [obj1, , hg] = createDRPVertexApplier({
		peerId: "peer1",
		drp: new SetDRP<number>(),
		aclOptions: { admins: ["peer1", "peer2", "peer3"] },
	});
	const [obj2, , hg2] = createDRPVertexApplier({
		peerId: "peer2",
		drp: new SetDRP<number>(),
		aclOptions: { admins: ["peer1", "peer2", "peer3"] },
	});
	const [obj3, , hg3] = createDRPVertexApplier({
		peerId: "peer3",
		drp: new SetDRP<number>(),
		aclOptions: { admins: ["peer1", "peer2", "peer3"] },
	});

	obj1.drp?.add(1);
	await obj2.applyVertices(hg.getAllVertices());

	obj1.drp?.add(1);
	obj1.drp?.delete(2);
	obj2.drp?.delete(2);
	obj2.drp?.add(2);

	await obj3.applyVertices(hg.getAllVertices());
	obj3.drp?.add(3);
	obj1.drp?.delete(1);

	await obj1.applyVertices(hg2.getAllVertices());
	obj1.drp?.delete(3);
	obj2.drp?.delete(1);

	await obj1.applyVertices(hg2.getAllVertices());
	await obj1.applyVertices(hg3.getAllVertices());

	const vertices = hg.getAllVertices();
	for (let i = 0; i < samples; i++) {
		tests.push([
			vertices[Math.floor(Math.random() * vertices.length)].hash,
			vertices[Math.floor(Math.random() * vertices.length)].hash,
		]);
	}

	bench("Causality check using BFS", () => {
		for (let i = 0; i < samples; i++) {
			hg.areCausallyRelatedUsingBFS(tests[i][0], tests[i][1]);
		}
	});

	bench("Causality check using Bitsets", () => {
		for (let i = 0; i < samples; i++) {
			hg.areCausallyRelatedUsingBitsets(tests[i][0], tests[i][1]);
		}
	});
});
