import { SetDRP } from "@ts-drp/blueprints/dist/src/index.js";
import {
	ActionType,
	DrpType,
	type Hash,
	type IACL,
	type IDRP,
	type Operation,
	SemanticsType,
	type Vertex,
} from "@ts-drp/types";
import { ObjectSet } from "@ts-drp/utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ObjectACL } from "../src/acl/index.js";
import { DRPVertexApplier as DRPSubObject } from "../src/drp-applier.js";
import { FinalityStore } from "../src/finality/index.js";
import { HashGraph } from "../src/hashgraph/index.js";
import { DRPObject } from "../src/index.js";
import { DRPObjectStateManager } from "../src/state.js";
import { createVertex } from "../src/utils/createVertex.js";
import { validateVertexDependencies } from "../src/vertex-validation.js";

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
	acl?: IACL;
	admins: string[];
}): [DRPSubObject<T>, DRPObjectStateManager<T>] {
	const acl2 = acl ?? new ObjectACL({ admins });
	const states2 = states ?? new DRPObjectStateManager(acl2, drp);
	const options = {
		type: DrpType.DRP,
		finalityStore: new FinalityStore(),
		acl: acl2,
		states: states2,
	};

	const obj = new DRPSubObject({ ...options, drp, hg, states: states2, notify });
	return [obj, states2];
}
describe("HashGraph construction tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	const acl = new ObjectACL({
		admins: ["peer1", "peer2"],
	});

	beforeEach(() => {
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
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			{ opType: "add", value: [2], drpType: DrpType.DRP },
		] as Operation[]);
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
			{
				opType: "test",
				value: [1],
				drpType: DrpType.DRP,
			},
			frontier,
			Date.now(),
			new Uint8Array()
		);
		hashgraph.addVertex(v1);

		const v2 = createVertex(
			"",
			{
				opType: "test",
				value: [2],
				drpType: DrpType.DRP,
			},
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

	test("Test: HashGraph with 2 root vertices", () => {
		/*
		  ROOT -- V1:ADD(1)
		  FAKE_ROOT -- V2:ADD(1)
		*/
		const hg = new HashGraph("peer1", undefined, undefined, SemanticsType.pair);
		// add fake root
		const fakeRoot = createVertex("peer1", { opType: "root", value: null, drpType: DrpType.DRP }, [], Date.now());
		expect(() => {
			validateVertexDependencies(fakeRoot, hg);
		}).toThrowError(`Vertex ${fakeRoot.hash} has no dependencies.`);
		const vertex = createVertex(
			"peer1",
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			[fakeRoot.hash],
			Date.now()
		);
		expect(() => {
			validateVertexDependencies(vertex, hg);
		}).toThrowError(`Vertex ${vertex.hash} has invalid dependency ${fakeRoot.hash}.`);

		const v1 = createVertex("peer1", { opType: "add", value: [1], drpType: DrpType.DRP }, hg.getFrontier(), Date.now());
		hg.addVertex(v1);
		expect(selfCheckConstraints(hg)).toBe(true);

		const linearizedVertices = hg.linearizeVertices();
		const expectedOps: Operation[] = [{ opType: "add", value: [1], drpType: DrpType.DRP }];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});

	//test("Root vertex drp state should not be modified", () => {
	//	obj1.drp?.add(1);
	//	obj1.drp?.add(2);
	//	const rootDRPState = obj1.drpStates.get(HashGraph.rootHash);
	//	expect(rootDRPState?.state.filter((e) => e.key === "_set")[0].value.size).toBe(0);
	//	const frontierState = obj1.drpStates.get(obj1.hashGraph.getFrontier()[0]);
	//	expect(frontierState?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
	//	expect(frontierState?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
	//});

	//test("Root vertex acl state should not be modified", () => {
	//	obj1.acl.grant("peer2", ACLGroup.Writer);
	//	expect(obj1.acl.query_isWriter("peer2")).toBe(true);
	//	const rootACLState = obj1.aclStates.get(HashGraph.rootHash);
	//	const authorizedPeers = rootACLState?.state.filter((e) => e.key === "_authorizedPeers")[0].value;
	//	expect(authorizedPeers.get("peer1")?.permissions.has(ACLGroup.Admin)).toBe(true);
	//	expect(authorizedPeers.get("peer2")).toBe(undefined);
	//});
});

describe("HashGraph for SetDRP tests", () => {
	let hg1: HashGraph;
	let hg2: HashGraph;
	let state2: DRPObjectStateManager<SetDRP<number>>;
	let obj1: DRPSubObject<SetDRP<number>>;
	let obj2: DRPSubObject<SetDRP<number>>;

	beforeEach(() => {
		vi.useFakeTimers();
		hg1 = new HashGraph("peer1", undefined, undefined, SemanticsType.pair);
		hg2 = new HashGraph("peer2", undefined, undefined, SemanticsType.pair);
		[obj1] = createDRPSubObject({
			hg: hg1,
			drp: new SetDRP<number>(),
			admins: ["peer1", "peer2"],
		});
		[obj2, state2] = createDRPSubObject({
			hg: hg2,
			states: state2,
			drp: new SetDRP<number>(),
			admins: ["peer1", "peer2"],
		});
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
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			{ opType: "delete", value: [1], drpType: DrpType.DRP },
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
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			{ opType: "delete", value: [1], drpType: DrpType.DRP },
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
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			{ opType: "add", value: [2], drpType: DrpType.DRP },
			{ opType: "delete", value: [1], drpType: DrpType.DRP },
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
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			{ opType: "delete", value: [1], drpType: DrpType.DRP },
			{ opType: "add", value: [10], drpType: DrpType.DRP },
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
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			{ opType: "delete", value: [1], drpType: DrpType.DRP },
			{ opType: "add", value: [2], drpType: DrpType.DRP },
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
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			{ opType: "add", value: [2], drpType: DrpType.DRP },
			{ opType: "delete", value: [2], drpType: DrpType.DRP },
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
		const hg1 = new HashGraph("peer1", undefined, undefined, SemanticsType.pair);
		const hg2 = new HashGraph("peer2", undefined, undefined, SemanticsType.pair);

		const [obj1] = createDRPSubObject({
			hg: hg1,
			drp: new SetDRP<number>(),
			admins: ["peer1", "peer2"],
		});
		const [obj2] = createDRPSubObject({
			hg: hg2,
			drp: new SetDRP<number>(),
			admins: ["peer1", "peer2"],
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
			{ opType: "add", value: [2], drpType: DrpType.DRP },
		]);
	});
});

//describe("Hashgraph and DRPObject merge without DRP tests", () => {
//	let obj1: DRPObject2<SetDRP<number>>;
//	let obj2: DRPObject2<SetDRP<number>>;
//	let obj3: DRPObject2<SetDRP<number>>;
//	const acl = new ObjectACL({
//		admins: ["peer1", "peer2"],
//	});

//	beforeAll(() => {
//		obj1 = new DRPObject2({ peerId: "peer1", acl, drp: new SetDRP<number>() });
//		obj2 = new DRPObject2({ peerId: "peer2", acl, drp: new SetDRP<number>() });
//		obj3 = new DRPObject2({ peerId: "peer3", acl });
//	});

//	test("Test object3 merge", async () => {
//		// reproduce Test: Joao's latest brain teaser
//		/*
//		                     __ V2:ADD(2) -------------\
//		  ROOT -- V1:ADD(1) /                           \ V5:RM(2)
//		                    \__ V3:RM(2) -- V4:RM(2) --/
//		*/

//		obj1.drp?.add(1);
//		await obj2.merge(obj1.vertices);

//		obj1.drp?.add(2);
//		obj2.drp?.delete(2);
//		obj2.drp?.delete(2);
//		await obj1.merge(obj2.vertices);
//		await obj2.merge(obj1.vertices);

//		obj1.drp?.delete(2);
//		await obj2.merge(obj1.vertices);

//		expect(obj1.drp?.query_has(1)).toBe(true);
//		expect(obj1.drp?.query_has(2)).toBe(false);
//		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

//		const linearizedVertices = obj1.hashGraph.linearizeVertices();
//		const expectedOps: Operation[] = [
//			{ opType: "add", value: [1], drpType: DrpType.DRP },
//			{ opType: "add", value: [2], drpType: DrpType.DRP },
//			{ opType: "delete", value: [2], drpType: DrpType.DRP },
//		];
//		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);

//		await obj3.merge(obj1.vertices);
//		expect(obj3.hashGraph.vertices).toEqual(obj1.hashGraph.vertices);
//	});
//});

describe("Vertex state tests", () => {
	let obj1: DRPSubObject<SetDRP<number>>;
	let obj2: DRPSubObject<SetDRP<number>>;
	let obj3: DRPSubObject<SetDRP<number>>;
	let hg1: HashGraph;
	let hg2: HashGraph;
	let hg3: HashGraph;
	let state1: DRPObjectStateManager<SetDRP<number>>;

	beforeEach(() => {
		vi.useFakeTimers({ now: 0 });
		hg1 = new HashGraph("peer1", undefined, undefined, SemanticsType.pair);
		hg2 = new HashGraph("peer2", undefined, undefined, SemanticsType.pair);
		hg3 = new HashGraph("peer3", undefined, undefined, SemanticsType.pair);
		const options = {
			type: DrpType.DRP,
			finalityStore: new FinalityStore(),
		};
		[obj1, state1] = createDRPSubObject({
			drp: new SetDRP<number>(),
			hg: hg1,
			...options,
			admins: ["peer1", "peer2", "peer3"],
		});
		[obj2] = createDRPSubObject({
			...options,
			drp: new SetDRP<number>(),
			hg: hg2,
			admins: ["peer1", "peer2", "peer3"],
		});
		[obj3] = createDRPSubObject({
			...options,
			drp: new SetDRP<number>(),
			hg: hg3,
			admins: ["peer1", "peer2", "peer3"],
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

		const drpState1 = state1.getDRP(vertices[1]);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(false);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);

		const drpState2 = state1.getDRP(vertices[2]);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);

		const drpState3 = state1.getDRP(vertices[3]);
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

		const drpState1 = state1.getDRP(hashA4);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(4)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(5)).toBe(false);

		const drpState2 = state1.getDRP(hashC5);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(false);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(4)).toBe(false);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(5)).toBe(true);

		const drpState3 = state1.getDRP(hashA6);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(4)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(5)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(6)).toBe(true);
	});
});

describe("Vertex timestamp tests", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: 0 });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("Test: Vertex's timestamp must not be less than any of its dependencies' timestamps", () => {
		/*
		        __ V1:ADD(1) __
		       /               \
		  ROOT -- V2:ADD(2) ---- V4:ADD(4) (invalid)
		       \               /
		        -- V3:ADD(3) --
		*/

		const hg = new HashGraph("peer1");
		const frontier = hg.getFrontier();
		const v1 = createVertex("peer1", { opType: "add", value: [1], drpType: DrpType.DRP }, frontier, Date.now());
		hg.addVertex(v1);
		vi.advanceTimersByTime(1000);
		const v2 = createVertex("peer2", { opType: "add", value: [2], drpType: DrpType.DRP }, frontier, Date.now());
		hg.addVertex(v2);
		vi.advanceTimersByTime(1000);
		const v3 = createVertex("peer3", { opType: "add", value: [3], drpType: DrpType.DRP }, frontier, Date.now() + 1);
		hg.addVertex(v3);

		const vertex = createVertex(
			"peer1",
			{
				opType: "add",
				value: [1],
				drpType: DrpType.DRP,
			},
			hg.getFrontier(),
			Date.now()
		);
		expect(() => validateVertexDependencies(vertex, hg)).toThrowError(
			`Vertex ${vertex.hash} has invalid timestamp 2001 > 2000.`
		);
	});
});

describe("Hash validation tests", () => {
	test("Should ignore vertices with invalid hash", () => {
		const hg1 = new HashGraph("peer1");
		const hg2 = new HashGraph("peer2");

		hg1.addVertex({
			hash: "hash",
			peerId: "peer1",
			operation: {
				opType: "add",
				value: ["value"],
				drpType: DrpType.DRP,
			},
			dependencies: hg1.getFrontier(),
			timestamp: Date.now(),
			signature: new Uint8Array(),
		});

		expect(hg1.getAllVertices().length).toBe(2);
		expect(hg2.getAllVertices().length).toBe(1);
		expect(hg2.getAllVertices().includes(hg1.getAllVertices()[1])).toBe(false);
	});
});
