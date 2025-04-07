import { SetDRP } from "@ts-drp/blueprints";
import {
	ACLGroup,
	ActionType,
	DrpType,
	type Hash,
	type IACL,
	type IHashGraph,
	Operation,
	SemanticsType,
	Vertex,
} from "@ts-drp/types";
import { ObjectSet } from "@ts-drp/utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createACL, type ObjectACL } from "../src/acl/index.js";
import { createDRPVertexApplier, type DRPVertexApplier } from "../src/drp-applier.js";
import { createVertex, HashGraph } from "../src/hashgraph/index.js";
import { DRPObject } from "../src/index.js";
import { type DRPObjectStateManager } from "../src/state.js";

function selfCheckConstraints(hg: HashGraph): boolean {
	const degree = new Map<Hash, number>();
	for (const vertex of hg.getAllVertices()) {
		const hash = vertex.hash;
		degree.set(hash, 0);
	}
	for (const [_, children] of hg.forwardEdges) {
		for (const child of children) {
			degree.set(child, (degree.get(child) || 0) + 1);
		}
	}
	for (const vertex of hg.getAllVertices()) {
		const hash = vertex.hash;
		if (degree.get(hash) !== vertex.dependencies.length) {
			return false;
		}
		if (vertex.dependencies.length === 0) {
			if (hash !== HashGraph.rootHash) {
				return false;
			}
		}
	}

	const topoOrder = hg.dfsTopologicalSortIterative(HashGraph.rootHash, new ObjectSet(hg.vertices.keys()));

	for (const vertex of hg.getAllVertices()) {
		if (!topoOrder.includes(vertex.hash)) {
			return false;
		}
	}
	return true;
}
describe("HashGraph construction tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	let acl: IACL;
	beforeEach(() => {
		acl = createACL({ admins: ["peer1", "peer2"] });
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });

		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 19)));
	});

	test("Test: Vertices are consistent across data structures", async () => {
		expect(obj1.vertices).toEqual(obj1.vertices);

		for (let i = 0; i < 100; i++) {
			obj1.drp?.add(i);
			expect(obj1.vertices).toEqual(obj1.vertices);
		}

		for (let i = 0; i < 100; i++) {
			obj2.drp?.add(i);
		}

		await obj1.merge(obj2.vertices);
		expect(obj1.vertices).toEqual(obj1.vertices);
	});

	test("Test: HashGraph should be DAG compatible", () => {
		/*
		        __ V1:ADD(1)
		  ROOT /
		       \__ V2:ADD(2)
		*/

		const hg1 = new HashGraph("peer1", undefined, undefined, SemanticsType.pair);
		const hg2 = new HashGraph("peer2", undefined, undefined, SemanticsType.pair);
		const v1 = createVertex("", { opType: "add", value: [1], drpType: DrpType.DRP }, hg1.getFrontier(), Date.now());
		hg1.addVertex(v1);
		const v2 = createVertex("", { opType: "add", value: [2], drpType: DrpType.DRP }, hg2.getFrontier(), Date.now());
		hg2.addVertex(v2);
		hg1
			.getAllVertices()
			.filter((v) => v.dependencies.length !== 0)
			.forEach(hg2.addVertex.bind(hg2));

		expect(selfCheckConstraints(hg2)).toBe(true);

		const linearizedVertices = hg2.linearizeVertices();
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual([
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			Operation.create({ opType: "add", value: [2], drpType: DrpType.DRP }),
		]);
	});

	test("Test: Should detect cycle in topological sort", () => {
		const hashgraph = new HashGraph(
			"",
			(_vertices: Vertex[]) => {
				return {
					action: ActionType.Nop,
				};
			},
			(_vertices: Vertex[]) => {
				return {
					action: ActionType.Nop,
				};
			},
			SemanticsType.pair
		);
		const frontier = hashgraph.getFrontier();
		const v1 = createVertex(
			"",
			Operation.create({ opType: "test", value: [1], drpType: DrpType.DRP }),
			frontier,
			Date.now(),
			new Uint8Array()
		);
		hashgraph.addVertex(v1);

		const v2 = createVertex(
			"",
			Operation.create({ opType: "test", value: [2], drpType: DrpType.DRP }),
			[v1.hash],
			Date.now(),
			new Uint8Array()
		);
		hashgraph.addVertex(v2);

		// create a cycle
		hashgraph.forwardEdges.set(v2.hash, [HashGraph.rootHash]);

		expect(() => {
			hashgraph.dfsTopologicalSortIterative(HashGraph.rootHash, new ObjectSet(hashgraph.vertices.keys()));
		}).toThrowError("Graph contains a cycle!");
	});

	test("Hash graph should be DAG compatible", () => {
		const drp1 = obj1.drp as SetDRP<number>;
		drp1.add(1);
		expect(selfCheckConstraints(obj1["hashgraph"])).toBe(true);
		const linearizedVertices = obj1["hashgraph"].linearizeVertices();
		const expectedOps = [Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP })];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});
});

describe("HashGraph for SetDRP tests", () => {
	let hg1: IHashGraph;
	let hg2: IHashGraph;
	let obj1: DRPVertexApplier<SetDRP<number>>;
	let obj2: DRPVertexApplier<SetDRP<number>>;

	beforeEach(() => {
		vi.useFakeTimers({ now: 0 });
		[obj1, , hg1] = createDRPVertexApplier({
			peerId: "peer1",
			drp: new SetDRP<number>(),
			aclOptions: { admins: ["peer1", "peer2"] },
		});
		[obj2, , hg2] = createDRPVertexApplier({
			peerId: "peer2",
			drp: new SetDRP<number>(),
			aclOptions: { admins: ["peer1", "peer2"] },
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("Test: Add Two Vertices", () => {
		/*
		  ROOT -- ADD(1) -- delete(1)
		*/

		obj1.drp?.add(1);
		obj1.drp?.delete(1);
		expect(obj1.drp?.query_has(1)).toBe(false);

		const linearizedVertices = hg1.linearizeVertices();
		const expectedOps: Operation[] = [
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			Operation.create({ opType: "delete", value: [1], drpType: DrpType.DRP }),
		];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});

	test("Test: Add Two Concurrent Vertices With Same Value", async () => {
		/*
		                     __ V2:delete(1)
		  ROOT -- V1:ADD(1) /
		                    \__ V3:ADD(1)
		*/
		obj1.drp?.add(1);
		await obj2.applyVertices(hg1.getAllVertices());
		expect(obj1.drp?.query_has(1)).toBe(true);
		obj1.drp?.delete(1);
		obj2.drp?.add(1);
		await obj1.applyVertices(hg2.getAllVertices());
		await obj2.applyVertices(hg1.getAllVertices());

		// Adding 1 again does not change the state
		expect(obj1.drp?.query_has(1)).toBe(false);
		expect(hg1.vertices).toEqual(hg2.vertices);

		const linearizedVertices = hg1.linearizeVertices();
		const expectedOps: Operation[] = [
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			Operation.create({ opType: "delete", value: [1], drpType: DrpType.DRP }),
			// add
		];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});

	test("Test: Add Two Concurrent Vertices With Different Values", async () => {
		/*
		                     __ V2:delete(1)
		  ROOT -- V1:ADD(1) /
		                    \__ V3:ADD(2)
		*/

		obj1.drp?.add(1);
		vi.advanceTimersByTime(1000);
		await obj2.applyVertices(hg1.getAllVertices());

		obj1.drp?.delete(1);
		vi.advanceTimersByTime(1000);
		obj2.drp?.add(2);
		await obj1.applyVertices(hg2.getAllVertices());
		await obj2.applyVertices(hg1.getAllVertices());
		expect(obj1.drp?.query_has(1)).toBe(false);
		expect(obj1.drp?.query_has(2)).toBe(true);
		expect(obj2.drp?.query_has(1)).toBe(false);
		expect(obj2.drp?.query_has(2)).toBe(true);
		expect(hg1.vertices).toEqual(hg2.vertices);

		const linearizedVertices = hg1.linearizeVertices();
		const expectedOps: Operation[] = [
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			Operation.create({ opType: "add", value: [2], drpType: DrpType.DRP }),
			Operation.create({ opType: "delete", value: [1], drpType: DrpType.DRP }),
		];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});

	test("Test: Tricky Case", async () => {
		/*
		                     __ V2:delete(1) -- V4:ADD(10)
		  ROOT -- V1:ADD(1) /
		                    \__ V3:ADD(1) -- V5:delete(5)
		*/

		obj1.drp?.add(1);
		await obj2.applyVertices(hg1.getAllVertices());

		obj1.drp?.delete(1);
		obj2.drp?.add(1);
		obj1.drp?.add(10);
		// Removing 5 does not change the state
		obj2.drp?.delete(5);
		await obj1.applyVertices(hg2.getAllVertices());
		await obj2.applyVertices(hg1.getAllVertices());

		expect(obj1.drp?.query_has(1)).toBe(false);
		expect(obj1.drp?.query_has(10)).toBe(true);
		expect(obj1.drp?.query_has(5)).toBe(false);
		expect(hg1.vertices).toEqual(hg2.vertices);

		const linearizedVertices = hg1.linearizeVertices();
		const expectedOps: Operation[] = [
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			Operation.create({ opType: "delete", value: [1], drpType: DrpType.DRP }),
			Operation.create({ opType: "add", value: [10], drpType: DrpType.DRP }),
		];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});

	test("Test: Yuta Papa's Case", async () => {
		/*
		                     __ V2:delete(1) -- V4:ADD(2)
		  ROOT -- V1:ADD(1) /
		                    \__ V3:delete(2) -- V5:ADD(1)
		*/

		obj1.drp?.add(1);
		await obj2.applyVertices(hg1.getAllVertices());

		obj1.drp?.delete(1);
		obj2.drp?.delete(2);
		obj1.drp?.add(2);
		obj2.drp?.add(1);
		await obj1.applyVertices(hg2.getAllVertices());
		await obj2.applyVertices(hg1.getAllVertices());

		expect(obj1.drp?.query_has(1)).toBe(false);
		expect(obj1.drp?.query_has(2)).toBe(true);
		expect(hg1.vertices).toEqual(hg2.vertices);

		const linearizedVertices = hg1.linearizeVertices();
		const expectedOps: Operation[] = [
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			Operation.create({ opType: "delete", value: [1], drpType: DrpType.DRP }),
			Operation.create({ opType: "add", value: [2], drpType: DrpType.DRP }),
		];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});

	test("Test: Joao's latest brain teaser", async () => {
		/*
		                     __ V2:ADD(2) -------------\
		  ROOT -- V1:ADD(1) /                           \ V5:RM(2)
		                    \__ V3:RM(2) -- V4:RM(2) --/
		*/
		obj1.drp?.add(1);
		await obj2.applyVertices(hg1.getAllVertices());

		obj1.drp?.add(2);
		obj2.drp?.delete(2);
		obj2.drp?.delete(2);
		await obj1.applyVertices(hg2.getAllVertices());
		await obj2.applyVertices(hg1.getAllVertices());

		obj1.drp?.delete(2);
		await obj2.applyVertices(hg1.getAllVertices());

		expect(obj1.drp?.query_has(1)).toBe(true);
		expect(obj1.drp?.query_has(2)).toBe(false);
		expect(hg1.vertices).toEqual(hg2.vertices);

		const linearizedVertices = hg1.linearizeVertices();
		const expectedOps: Operation[] = [
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			Operation.create({ opType: "add", value: [2], drpType: DrpType.DRP }),
			Operation.create({ opType: "delete", value: [2], drpType: DrpType.DRP }),
		];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});

	test("Should return topological sort order when linearizing vertices", async () => {
		obj1.drp?.add(1);
		await obj2.applyVertices(hg1.getAllVertices());

		obj1.drp?.add(2);
		obj2.drp?.delete(2);
		obj2.drp?.delete(2);
		await obj1.applyVertices(hg2.getAllVertices());
		await obj2.applyVertices(hg1.getAllVertices());

		obj1.drp?.delete(2);
		await obj2.applyVertices(hg1.getAllVertices());

		const order1 = hg1.topologicalSort();
		const linearizedVertices1 = hg1.linearizeVertices();
		for (let i = 0; i < linearizedVertices1.length; ++i) {
			expect(linearizedVertices1[i].operation).toBe(hg1.vertices.get(order1[i + 1])?.operation);
		}

		const order2 = hg2.topologicalSort();
		const linearizedVertices2 = hg2.linearizeVertices();
		for (let i = 0; i < linearizedVertices2.length; ++i) {
			expect(linearizedVertices2[i].operation).toBe(hg2.vertices.get(order2[i + 1])?.operation);
		}
	});
});

describe("HashGraph for undefined operations tests", () => {
	test("Test: merge should skip undefined operations", async () => {
		const [obj1, , hg1] = createDRPVertexApplier({
			peerId: "peer1",
			drp: new SetDRP<number>(),
			aclOptions: { admins: ["peer1", "peer2"] },
		});
		const [obj2, , hg2] = createDRPVertexApplier({
			peerId: "peer2",
			drp: new SetDRP<number>(),
			aclOptions: { admins: ["peer1", "peer2"] },
		});

		obj1.drp?.add(1);
		obj2.drp?.add(2);

		// Set one of the vertice from obj1.drp? to have undefined operation
		const vertices = hg1.getAllVertices();
		vertices[1].operation = undefined;

		await obj2.applyVertices(vertices);
		const linearizedVertices = hg2.linearizeVertices();
		// Should only have one, since we skipped the undefined operations
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual([
			Operation.create({ opType: "add", value: [2], drpType: DrpType.DRP }),
		]);
	});
});

describe("Hashgraph and DRPObject merge without DRP tests", () => {
	test("Test object3 merge", async () => {
		const acl = createACL({ admins: ["peer1", "peer2"] });
		const obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		const obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
		const obj3 = new DRPObject({ peerId: "peer3", acl });
		// reproduce Test: Joao's latest brain teaser
		/*
		                     __ V2:ADD(2) -------------\
		  ROOT -- V1:ADD(1) /                           \ V5:RM(2)
		                    \__ V3:RM(2) -- V4:RM(2) --/
		*/

		obj1.drp?.add(1);
		await obj2.merge(obj1.vertices);

		obj1.drp?.add(2);
		obj2.drp?.delete(2);
		obj2.drp?.delete(2);
		await obj1.merge(obj2.vertices);
		await obj2.merge(obj1.vertices);

		obj1.drp?.delete(2);
		await obj2.merge(obj1.vertices);

		expect(obj1.drp?.query_has(1)).toBe(true);
		expect(obj1.drp?.query_has(2)).toBe(false);
		expect(obj1.vertices).toEqual(obj2.vertices);

		const linearizedVertices = obj1["hashgraph"].linearizeVertices();
		const expectedOps: Operation[] = [
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			Operation.create({ opType: "add", value: [2], drpType: DrpType.DRP }),
			Operation.create({ opType: "delete", value: [2], drpType: DrpType.DRP }),
		];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);

		await obj3.merge(obj1.vertices);
		expect(obj3.vertices).toEqual(obj1.vertices);
	});
});

describe("Vertex state tests", () => {
	let obj1: DRPVertexApplier<SetDRP<number>>;
	let obj2: DRPVertexApplier<SetDRP<number>>;
	let obj3: DRPVertexApplier<SetDRP<number>>;
	let hg1: IHashGraph;
	let hg2: IHashGraph;
	let hg3: IHashGraph;
	let state1: DRPObjectStateManager<SetDRP<number>>;

	beforeEach(() => {
		vi.useFakeTimers({ now: 0 });
		[obj1, state1, hg1] = createDRPVertexApplier({
			peerId: "peer1",
			drp: new SetDRP<number>(),
			aclOptions: { admins: ["peer1", "peer2", "peer3"] },
		});
		[obj2, , hg2] = createDRPVertexApplier({
			peerId: "peer2",
			drp: new SetDRP<number>(),
			aclOptions: { admins: ["peer1", "peer2", "peer3"] },
		});
		[obj3, , hg3] = createDRPVertexApplier({
			peerId: "peer3",
			drp: new SetDRP<number>(),
			aclOptions: { admins: ["peer1", "peer2", "peer3"] },
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("Test: Vertex states work correctly with single HashGraph", () => {
		/*
		  ROOT -- V1:ADD(1) -- V2:ADD(2) -- V3:ADD(3)
		*/
		obj1.drp?.add(1);
		vi.advanceTimersByTime(1);
		obj1.drp?.add(2);
		vi.advanceTimersByTime(1);
		obj1.drp?.add(3);

		const vertices = hg1.topologicalSort();

		const drpState1 = state1.getDRPState(vertices[1]);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(false);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);

		const drpState2 = state1.getDRPState(vertices[2]);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);

		const drpState3 = state1.getDRPState(vertices[3]);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(true);
	});

	test("Test: Tricky merging", async () => {
		/*
		        __ V1:ADD(1) ------ V4:ADD(4) __
		       /                   /            \
		  ROOT -- V2:ADD(2) ------/              \ V6:ADD(6)
		       \                   \            /
		        -- V3:ADD(3) ------ V5:ADD(5) --
		*/

		// in above hashgraph, A represents obj1.drp?, B represents obj2.drp?, C represents drp3
		obj1.drp?.add(1);
		obj2.drp?.add(2);
		obj3.drp?.add(3);

		await obj1.applyVertices(hg2.getAllVertices());
		await obj3.applyVertices(hg2.getAllVertices());

		obj1.drp?.add(4);
		obj3.drp?.add(5);
		const hashA4 = hg1.getFrontier()[0];
		const hashC5 = hg3.getFrontier()[0];

		await obj1.applyVertices(hg3.getAllVertices());
		await obj3.applyVertices(hg1.getAllVertices());
		obj1.drp?.add(6);
		const hashA6 = hg1.getFrontier()[0];

		const drpState1 = state1.getDRPState(hashA4);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(4)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(5)).toBe(false);

		const drpState2 = state1.getDRPState(hashC5);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(false);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(4)).toBe(false);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(5)).toBe(true);

		const drpState3 = state1.getDRPState(hashA6);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(4)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(5)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(6)).toBe(true);
	});
});

describe("Hashgraph for SetDRP and ACL tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	let obj3: DRPObject<SetDRP<number>>;

	beforeEach(async () => {
		const acl = createACL({ admins: ["peer1"] });
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
		obj3 = new DRPObject({ peerId: "peer3", acl, drp: new SetDRP<number>() });

		const acl1 = obj1.acl as ObjectACL;
		acl1.grant("peer2", ACLGroup.Finality);
		acl1.grant("peer3", ACLGroup.Finality);
		await obj2.merge(obj1.vertices);
		await obj3.merge(obj1.vertices);
	});

	test("Node without writer permission can generate vertex locally", () => {
		const drp = obj1.drp as SetDRP<number>;
		drp.add(1);
		drp.add(2);

		expect(drp.query_has(1)).toBe(true);
		expect(drp.query_has(2)).toBe(true);
	});

	test("Discard vertex if creator does not have write permission", async () => {
		obj1.drp?.add(1);
		expect(() => obj2.drp?.add(2)).toThrowError();

		await obj1.merge(obj2.vertices);
		expect(obj1.drp?.query_has(2)).toBe(false);
	});

	test("Accept vertex if creator has write permission", async () => {
		/*
		  ROOT -- V1:ADD(1) -- V2:GRANT(peer2) -- V3:ADD(4)
		*/
		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;
		const acl1 = obj1.acl as ObjectACL;
		const acl2 = obj2.acl as ObjectACL;

		drp1.add(1);
		acl1.grant("peer2", ACLGroup.Writer);
		expect(acl1.query_isAdmin("peer1")).toBe(true);

		await obj2.merge(obj1.vertices);
		expect(drp2.query_has(1)).toBe(true);
		expect(acl2.query_isWriter("peer2")).toBe(true);

		drp2.add(4);
		await obj1.merge(obj2.vertices);
		expect(drp1.query_has(4)).toBe(true);
	});

	test("Discard vertex if writer permission is revoked", async () => {
		/*
		                                              __ V4:ADD(1) --
		                                             /                \
		  ROOT -- V1:GRANT(peer2) -- V2:grant(peer3)                   V6:REVOKE(peer3) -- V7:ADD(4)
		                                             \                /
		                                              -- V5:ADD(2) --
		*/

		obj1.acl.grant("peer2", ACLGroup.Writer);
		obj1.acl.grant("peer3", ACLGroup.Writer);

		await obj2.merge(obj1.vertices);
		await obj3.merge(obj1.vertices);

		obj2.drp?.add(1);
		obj3.drp?.add(2);
		await obj1.merge(obj2.vertices);
		await obj1.merge(obj3.vertices);
		await obj2.merge(obj3.vertices);
		await obj3.merge(obj2.vertices);
		expect(obj1.drp?.query_has(1)).toBe(true);
		expect(obj1.drp?.query_has(2)).toBe(true);

		obj1.acl.revoke("peer3", ACLGroup.Writer);
		await obj3.merge(obj1.vertices);
		expect(() => obj3.drp?.add(3)).toThrowError();
		await obj2.merge(obj3.vertices);
		expect(obj2.drp?.query_has(3)).toBe(false);

		obj2.drp?.add(4);
		await obj1.merge(obj2.vertices);
		await obj1.merge(obj3.vertices);
		expect(obj1.drp?.query_has(3)).toBe(false);
		expect(obj1.drp?.query_has(4)).toBe(true);
	});

	test("Should grant admin permission to a peer", () => {
		const acl1 = obj1.acl as ObjectACL;
		const newAdminPeer1 = "newAdminPeer1";
		acl1.grant("newAdminPeer1", ACLGroup.Admin);
		expect(acl1.query_isAdmin(newAdminPeer1)).toBe(true);
	});

	test("Should use ACL on dependencies to determine if vertex is valid", async () => {
		/*
		  ROOT -- V1:ADD(1) -- V2:ADD(2) -- V3:GRANT(peer2)
		  					\_ V4:ADD(3) (invalid)
		*/
		const acl = createACL({ admins: ["peer1"] });
		const obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		const obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });

		const drp1 = obj1.drp as SetDRP<number>;
		const acl1 = obj1.acl as ObjectACL;

		drp1.add(1);
		const hash1 = obj1["hashgraph"].getFrontier()[0];
		await obj2.merge(obj1.vertices);
		drp1.add(2);
		acl1.grant("peer2", ACLGroup.Writer);

		const vertex = createVertex(
			"peer2",
			{ opType: "add", value: [3], drpType: DrpType.DRP },
			[hash1],
			Date.now(),
			new Uint8Array()
		);

		obj2["hashgraph"].addVertex(vertex);

		await obj1.merge(obj2.vertices);
		expect(drp1.query_has(3)).toBe(false);
	});
});

describe("Hash validation tests", () => {
	test("Should ignore vertices with invalid hash", () => {
		const hg1 = new HashGraph("peer1");
		const hg2 = new HashGraph("peer2");

		hg1.addVertex(
			Vertex.create({
				hash: "hash",
				peerId: "peer1",
				operation: Operation.create({ opType: "add", value: ["value"], drpType: DrpType.DRP }),
				dependencies: hg1.getFrontier(),
				timestamp: Date.now(),
				signature: new Uint8Array(),
			})
		);

		expect(hg1.getAllVertices().length).toBe(2);
		expect(hg2.getAllVertices().length).toBe(1);
		expect(hg2.getAllVertices().includes(hg1.getAllVertices()[1])).toBe(false);
	});
});
