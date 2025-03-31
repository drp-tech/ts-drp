import { SetDRP } from "@ts-drp/blueprints";
import { DrpType, type Hash, type IACL, type IDRP, SemanticsType } from "@ts-drp/types";
import { bench, describe } from "vitest";

import { DRPVertexApplier as DRPSubObject } from "../src/drp-applier.js";
import { FinalityStore } from "../src/finality/index.js";
import { HashGraph } from "../src/hashgraph/index.js";
import { ObjectACL } from "../src/index.js";
import { DRPObjectStateManager } from "../src/state.js";
const notify = (): void => {};

function createDRPSubObject<T extends IDRP>({
	drp,
	states,
	hg,
	acl,
	admins,
}: {
	drp: T;
	states?: DRPObjectStateManager<T>;
	hg: HashGraph;
	localPeerID: string;
	acl?: IACL;
	admins: string[];
}): DRPSubObject<T> {
	const acl2 = acl ?? new ObjectACL({ admins });
	const options = {
		type: DrpType.DRP,
		finalityStore: new FinalityStore(),
		acl: acl2,
		states: states ?? new DRPObjectStateManager(acl2, drp),
	};

	const obj = new DRPSubObject({ ...options, drp, hg, states, notify });
	return obj;
}

describe("AreCausallyDependent benchmark", async () => {
	const samples = 100000;
	const tests: Hash[][] = [];

	const hg = new HashGraph("peer1", undefined, undefined, SemanticsType.pair);
	const hg2 = new HashGraph("peer2", undefined, undefined, SemanticsType.pair);
	const hg3 = new HashGraph("peer3", undefined, undefined, SemanticsType.pair);

	const obj1 = createDRPSubObject({
		localPeerID: "peer1",
		drp: new SetDRP<number>(),
		hg,
		admins: ["peer1", "peer2", "peer3"],
	});
	const obj2 = createDRPSubObject({
		localPeerID: "peer2",
		drp: new SetDRP<number>(),
		hg: hg2,
		admins: ["peer1", "peer2", "peer3"],
	});
	const obj3 = createDRPSubObject({
		localPeerID: "peer3",
		drp: new SetDRP<number>(),
		hg: hg3,
		admins: ["peer1", "peer2", "peer3"],
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
