import { MapConflictResolution, MapDRP, SetDRP } from "@ts-drp/blueprints";
import {
	ACLGroup,
	ActionType,
	type DrpRuntimeContext,
	DrpType,
	type Hash,
	type IDRP,
	type Operation,
	SemanticsType,
	type Vertex,
} from "@ts-drp/types";
import { ObjectSet } from "@ts-drp/utils";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { ObjectACL } from "../src/acl/index.js";
import { DRPObject, HashGraph, newVertex } from "../src/index.js";

const acl = new ObjectACL({
	admins: ["peer1", "peer2", "peer3"],
});

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
	const acl = new ObjectACL({
		admins: ["peer1"],
	});

	beforeEach(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });

		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(1998, 11, 19)));
	});

	test("Test: Vertices are consistent across data structures", async () => {
		expect(obj1.vertices).toEqual(obj1.hashGraph.getAllVertices());

		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		for (let i = 0; i < 100; i++) {
			drp1.add(i);
			expect(obj1.vertices).toEqual(obj1.hashGraph.getAllVertices());
		}

		for (let i = 0; i < 100; i++) {
			drp2.add(i);
		}

		await obj1.merge(obj2.hashGraph.getAllVertices());
		expect(obj1.vertices).toEqual(obj1.hashGraph.getAllVertices());
	});

	test("Test: HashGraph should be DAG compatible", async () => {
		/*
		        __ V1:ADD(1)
		  ROOT /
		       \__ V2:ADD(2)
		*/
		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		drp2.add(2);
		await obj2.merge(obj1.hashGraph.getAllVertices());
		expect(selfCheckConstraints(obj2.hashGraph)).toBe(true);

		const linearizedVertices = obj2.hashGraph.linearizeVertices();
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
		const v1 = newVertex(
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

		const v2 = newVertex(
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

	test("Hash graph should be DAG compatible", () => {
		const drp1 = obj1.drp as SetDRP<number>;
		drp1.add(1);
		expect(selfCheckConstraints(obj1.hashGraph)).toBe(true);
		const linearizedVertices = obj1.hashGraph.linearizeVertices();
		const expectedOps: Operation[] = [{ opType: "add", value: [1], drpType: DrpType.DRP }];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});

	test("Root vertex drp state should not be modified", () => {
		const drp1 = obj1.drp as SetDRP<number>;
		drp1.add(1);
		drp1.add(2);
		const rootDRPState = obj1.drpStates.get(HashGraph.rootHash);
		expect(rootDRPState?.state.filter((e) => e.key === "_set")[0].value.size).toBe(0);
		const frontierState = obj1.drpStates.get(obj1.hashGraph.getFrontier()[0]);
		expect(frontierState?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(frontierState?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
	});

	test("Root vertex acl state should not be modified", () => {
		const acl1 = obj1.acl as ObjectACL;
		acl1.grant("peer2", ACLGroup.Writer);
		expect(acl1.query_isWriter("peer2")).toBe(true);
		const rootACLState = obj1.aclStates.get(HashGraph.rootHash);
		const authorizedPeers = rootACLState?.state.filter((e) => e.key === "_authorizedPeers")[0].value;
		expect(authorizedPeers.get("peer1")?.permissions.has(ACLGroup.Admin)).toBe(true);
		expect(authorizedPeers.get("peer2")).toBe(undefined);
	});
});

describe("HashGraph for SetDRP tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	const acl = new ObjectACL({
		admins: ["peer1", "peer2"],
	});

	beforeEach(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
	});

	test("Test: Add Two Vertices", () => {
		/*
		  ROOT -- ADD(1) -- delete(1)
		*/

		const drp1 = obj1.drp as SetDRP<number>;
		drp1.add(1);
		drp1.delete(1);
		expect(drp1.query_has(1)).toBe(false);

		const linearizedVertices = obj1.hashGraph.linearizeVertices();
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

		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		await obj2.merge(obj1.hashGraph.getAllVertices());

		drp1.delete(1);
		drp2.add(1);
		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj2.merge(obj1.hashGraph.getAllVertices());

		// Adding 1 again does not change the state
		expect(drp1.query_has(1)).toBe(false);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearizedVertices = obj1.hashGraph.linearizeVertices();
		const expectedOps: Operation[] = [
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			{ opType: "delete", value: [1], drpType: DrpType.DRP },
		];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});

	test("Test: Add Two Concurrent Vertices With Different Values", async () => {
		/*
		                     __ V2:delete(1)
		  ROOT -- V1:ADD(1) /
		                    \__ V3:ADD(2)
		*/

		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		await obj2.merge(obj1.hashGraph.getAllVertices());

		drp1.delete(1);
		drp2.add(2);
		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj2.merge(obj1.hashGraph.getAllVertices());

		expect(drp1.query_has(1)).toBe(false);
		expect(drp1.query_has(2)).toBe(true);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearizedVertices = obj1.hashGraph.linearizeVertices();
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

		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		await obj2.merge(obj1.hashGraph.getAllVertices());

		drp1.delete(1);
		drp2.add(1);
		drp1.add(10);
		// Removing 5 does not change the state
		drp2.delete(5);
		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj2.merge(obj1.hashGraph.getAllVertices());

		expect(drp1.query_has(1)).toBe(false);
		expect(drp1.query_has(10)).toBe(true);
		expect(drp1.query_has(5)).toBe(false);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearizedVertices = obj1.hashGraph.linearizeVertices();
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

		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		await obj2.merge(obj1.hashGraph.getAllVertices());

		drp1.delete(1);
		drp2.delete(2);
		drp1.add(2);
		drp2.add(1);
		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj2.merge(obj1.hashGraph.getAllVertices());

		expect(drp1.query_has(1)).toBe(false);
		expect(drp1.query_has(2)).toBe(true);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearizedVertices = obj1.hashGraph.linearizeVertices();
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

		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		await obj2.merge(obj1.hashGraph.getAllVertices());

		drp1.add(2);
		drp2.delete(2);
		drp2.delete(2);
		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj2.merge(obj1.hashGraph.getAllVertices());

		drp1.delete(2);
		await obj2.merge(obj1.hashGraph.getAllVertices());

		expect(drp1.query_has(1)).toBe(true);
		expect(drp1.query_has(2)).toBe(false);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearizedVertices = obj1.hashGraph.linearizeVertices();
		const expectedOps: Operation[] = [
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			{ opType: "add", value: [2], drpType: DrpType.DRP },
			{ opType: "delete", value: [2], drpType: DrpType.DRP },
		];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);
	});

	test("Should return topological sort order when linearizing vertices", async () => {
		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		await obj2.merge(obj1.hashGraph.getAllVertices());

		drp1.add(2);
		drp2.delete(2);
		drp2.delete(2);
		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj2.merge(obj1.hashGraph.getAllVertices());

		drp1.delete(2);
		await obj2.merge(obj1.hashGraph.getAllVertices());

		const order1 = obj1.hashGraph.topologicalSort();
		const linearizedVertices1 = obj1.hashGraph.linearizeVertices();
		for (let i = 0; i < linearizedVertices1.length; ++i) {
			expect(linearizedVertices1[i].operation).toBe(obj1.hashGraph.vertices.get(order1[i + 1])?.operation);
		}

		const order2 = obj2.hashGraph.topologicalSort();
		const linearizedVertices2 = obj2.hashGraph.linearizeVertices();
		for (let i = 0; i < linearizedVertices2.length; ++i) {
			expect(linearizedVertices2[i].operation).toBe(obj2.hashGraph.vertices.get(order2[i + 1])?.operation);
		}
	});
});

describe("HashGraph for undefined operations tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;

	beforeEach(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
	});

	test("Test: merge should skip undefined operations", async () => {
		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		drp2.add(2);

		// Set one of the vertice from drp1 to have undefined operation
		obj1.hashGraph.getAllVertices()[1].operation = undefined;

		await obj2.merge(obj1.hashGraph.getAllVertices());

		const linearizedVertices = obj2.hashGraph.linearizeVertices();
		// Should only have one, since we skipped the undefined operations
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual([
			{ opType: "add", value: [2], drpType: DrpType.DRP },
		]);
	});
});

describe("Hashgraph and DRPObject merge without DRP tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	let obj3: DRPObject<SetDRP<number>>;
	const acl = new ObjectACL({
		admins: ["peer1", "peer2"],
	});

	beforeAll(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
		obj3 = new DRPObject({ peerId: "peer3", acl });
	});

	test("Test object3 merge", async () => {
		// reproduce Test: Joao's latest brain teaser
		/*
		                     __ V2:ADD(2) -------------\
		  ROOT -- V1:ADD(1) /                           \ V5:RM(2)
		                    \__ V3:RM(2) -- V4:RM(2) --/
		*/

		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		await obj2.merge(obj1.hashGraph.getAllVertices());

		drp1.add(2);
		drp2.delete(2);
		drp2.delete(2);
		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj2.merge(obj1.hashGraph.getAllVertices());

		drp1.delete(2);
		await obj2.merge(obj1.hashGraph.getAllVertices());

		expect(drp1.query_has(1)).toBe(true);
		expect(drp1.query_has(2)).toBe(false);
		expect(obj1.hashGraph.vertices).toEqual(obj2.hashGraph.vertices);

		const linearizedVertices = obj1.hashGraph.linearizeVertices();
		const expectedOps: Operation[] = [
			{ opType: "add", value: [1], drpType: DrpType.DRP },
			{ opType: "add", value: [2], drpType: DrpType.DRP },
			{ opType: "delete", value: [2], drpType: DrpType.DRP },
		];
		expect(linearizedVertices.map((vertex) => vertex.operation)).toEqual(expectedOps);

		await obj3.merge(obj1.hashGraph.getAllVertices());
		expect(obj3.hashGraph.vertices).toEqual(obj1.hashGraph.vertices);
	});
});

describe("Vertex state tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	let obj3: DRPObject<SetDRP<number>>;

	beforeEach(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
		obj3 = new DRPObject({ peerId: "peer3", acl, drp: new SetDRP<number>() });
	});

	test("Test: Vertex states work correctly with single HashGraph", () => {
		/*
		  ROOT -- V1:ADD(1) -- V2:ADD(2) -- V3:ADD(3)
		*/
		const drp1 = obj1.drp as SetDRP<number>;

		drp1.add(1);
		drp1.add(2);
		drp1.add(3);

		const vertices = obj1.hashGraph.topologicalSort();

		const drpState1 = obj1.drpStates.get(vertices[1]);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(false);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);

		const drpState2 = obj1.drpStates.get(vertices[2]);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);

		const drpState3 = obj1.drpStates.get(vertices[3]);
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

		// in above hashgraph, A represents drp1, B represents drp2, C represents drp3
		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;
		const drp3 = obj3.drp as SetDRP<number>;

		drp1.add(1);
		drp2.add(2);
		drp3.add(3);

		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj3.merge(obj2.hashGraph.getAllVertices());

		drp1.add(4);
		drp3.add(5);

		const hashA4 = obj1.hashGraph.getFrontier()[0];
		const hashC5 = obj3.hashGraph.getFrontier()[0];

		await obj1.merge(obj3.hashGraph.getAllVertices());
		await obj3.merge(obj1.hashGraph.getAllVertices());
		drp1.add(6);
		const hashA6 = obj1.hashGraph.getFrontier()[0];

		const drpState1 = obj1.drpStates.get(hashA4);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(4)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(5)).toBe(false);

		const drpState2 = obj1.drpStates.get(hashC5);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(false);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(4)).toBe(false);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(5)).toBe(true);

		const drpState3 = obj1.drpStates.get(hashA6);
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
		const acl = new ObjectACL({ admins: ["peer1"] });
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
		obj3 = new DRPObject({ peerId: "peer3", acl, drp: new SetDRP<number>() });

		const acl1 = obj1.acl as ObjectACL;
		acl1.grant("peer2", ACLGroup.Finality);
		acl1.grant("peer3", ACLGroup.Finality);
		await obj2.merge(obj1.hashGraph.getAllVertices());
		await obj3.merge(obj1.hashGraph.getAllVertices());
	});

	test("Node without writer permission can generate vertex locally", () => {
		const drp = obj1.drp as SetDRP<number>;
		drp.add(1);
		drp.add(2);

		expect(drp.query_has(1)).toBe(true);
		expect(drp.query_has(2)).toBe(true);
	});

	test("Discard vertex if creator does not have write permission", async () => {
		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;

		drp1.add(1);
		drp2.add(2);

		await obj1.merge(obj2.hashGraph.getAllVertices());
		expect(drp1.query_has(2)).toBe(false);
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

		await obj2.merge(obj1.hashGraph.getAllVertices());
		expect(drp2.query_has(1)).toBe(true);
		expect(acl2.query_isWriter("peer2")).toBe(true);

		drp2.add(4);
		await obj1.merge(obj2.hashGraph.getAllVertices());
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
		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;
		const drp3 = obj3.drp as SetDRP<number>;
		const acl1 = obj1.acl as ObjectACL;

		acl1.grant("peer2", ACLGroup.Writer);
		acl1.grant("peer3", ACLGroup.Writer);
		await obj2.merge(obj1.hashGraph.getAllVertices());
		await obj3.merge(obj1.hashGraph.getAllVertices());

		drp2.add(1);
		drp3.add(2);
		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj1.merge(obj3.hashGraph.getAllVertices());
		await obj2.merge(obj3.hashGraph.getAllVertices());
		await obj3.merge(obj2.hashGraph.getAllVertices());
		expect(drp1.query_has(1)).toBe(true);
		expect(drp1.query_has(2)).toBe(true);

		acl1.revoke("peer3", ACLGroup.Writer);
		await obj3.merge(obj1.hashGraph.getAllVertices());
		drp3.add(3);
		await obj2.merge(obj3.hashGraph.getAllVertices());
		expect(drp2.query_has(3)).toBe(false);

		drp2.add(4);
		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj1.merge(obj3.hashGraph.getAllVertices());
		expect(drp1.query_has(3)).toBe(false);
		expect(drp1.query_has(4)).toBe(true);
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
		const acl = new ObjectACL({
			admins: ["peer1"],
		});
		const obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		const obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });

		const drp1 = obj1.drp as SetDRP<number>;
		const acl1 = obj1.acl as ObjectACL;

		drp1.add(1);
		const hash1 = obj1.hashGraph.getFrontier()[0];
		await obj2.merge(obj1.hashGraph.getAllVertices());
		drp1.add(2);
		acl1.grant("peer2", ACLGroup.Writer);

		const vertex = newVertex(
			"peer2",
			{ opType: "add", value: [3], drpType: DrpType.DRP },
			[hash1],
			Date.now(),
			new Uint8Array()
		);
		obj2.hashGraph.addVertex(vertex);

		await obj1.merge(obj2.hashGraph.getAllVertices());
		expect(drp1.query_has(3)).toBe(false);
	});

	test("Should update key in the ACL", async () => {
		const acl1 = obj1.acl as ObjectACL;
		acl1.setKey("blsPublicKey1");

		await obj2.merge(obj1.hashGraph.getAllVertices());
		const acl2 = obj2.acl as ObjectACL;
		expect(acl2.query_getPeerKey("peer1")).toStrictEqual("blsPublicKey1");

		const acl3 = obj3.acl as ObjectACL;
		acl3.setKey("blsPublicKey3");
		acl2.setKey("blsPublicKey2");

		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj1.merge(obj3.hashGraph.getAllVertices());
		expect(acl1.query_getPeerKey("peer2")).toStrictEqual("blsPublicKey2");
		expect(acl1.query_getPeerKey("peer3")).toStrictEqual("blsPublicKey3");
	});
});

describe("HashGraph for set wins map tests", () => {
	let obj1: DRPObject<MapDRP<string, string>>;
	let obj2: DRPObject<MapDRP<string, string>>;
	let obj3: DRPObject<MapDRP<string, string>>;

	beforeEach(() => {
		obj1 = new DRPObject({
			peerId: "peer1",
			acl,
			drp: new MapDRP<string, string>(),
		});
		obj2 = new DRPObject({
			peerId: "peer2",
			acl,
			drp: new MapDRP<string, string>(),
		});
		obj3 = new DRPObject({
			peerId: "peer3",
			acl,
			drp: new MapDRP<string, string>(),
		});
	});

	test("Should correctly perform set and delete map operations", async () => {
		/*
		       __ V1:SET("key1", "value1") -- V3:DELETE("key1")
		      /
		  ROOT
		      \
		       -- V2:SET("key2, "value2")
		*/
		const drp1 = obj1.drp;
		const drp2 = obj2.drp;
		drp1?.set("key1", "value1");
		drp2?.set("key2", "value2");
		drp1?.delete("key1");

		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj2.merge(obj1.hashGraph.getAllVertices());

		expect(drp1?.query_get("key2")).toBe("value2");
		expect(drp2?.query_get("key1")).toBe(undefined);
	});

	test("Should resolve conflicts between concurrent set and delete operations that set wins after merging", async () => {
		/*
		       __ V1:SET("key1", "value2") ------------------------- V5:DELETE("key2")
		      /                                                    /
		  ROOT                                                    /
		      \                                                  /
		       --- V2:SET("key1", "value1") -- V3:DELETE("key1") -- V4:SET("key2", "value2")
		*/

		const drp1 = obj1.drp;
		const drp2 = obj2.drp;

		drp1?.set("key1", "value2"); // smaller hash
		drp2?.set("key1", "value1"); // greater hash
		drp2?.delete("key1");

		expect(drp1?.query_get("key1")).toBe("value2");
		await obj1.merge(obj2.hashGraph.getAllVertices());
		expect(drp1?.query_get("key1")).toBe(undefined);

		drp2?.set("key2", "value2");
		drp1?.delete("key2");

		expect(drp2?.query_get("key2")).toBe("value2");
		await obj2.merge(obj1.hashGraph.getAllVertices());
		expect(drp2?.query_get("key2")).toBe("value2");
	});

	test("Should resolve conflict between concurrent set and delete operations that set wins after merging complex case", async () => {
		/*
		        __ V1:SET("key1", "value1") -- V2:DELETE("key2") -- V5:SET("key2", "value1")
		       /                                                                            \
		      /                                                                              \
		  ROOT -- V3:DELETE("key3") -- V4:SET("key2", "value2") ------------------------------ V7:DELETE("key1")
		      \                                                    \                           \
		       \                                                    ----------------------------\
		        -- V6:SET("key2", "eulav3") ---------------------------------------------------- v8:SET("key1", "value")
		*/

		obj1.drp?.set("key1", "value1");
		obj1.drp?.delete("key2");
		obj2.drp?.delete("key3");
		obj2.drp?.set("key2", "value2");
		await obj1.merge(obj2.hashGraph.getAllVertices());
		await obj2.merge(obj1.hashGraph.getAllVertices());
		expect(obj1.drp?.query_get("key2")).toBe("value2");

		obj3.drp?.set("key2", "eulav3");
		await obj3.merge(obj1.hashGraph.getAllVertices());
		expect(obj3.drp?.query_get("key2")).toBe("eulav3");

		obj2.drp?.delete("key1");
		expect(obj2.drp?.query_get("key1")).toBe(undefined);
		obj3.drp?.set("key1", "value");
		await obj1.merge(obj3.hashGraph.getAllVertices());
		await obj1.merge(obj2.hashGraph.getAllVertices());
		expect(obj1.drp?.query_get("key1")).toBe("value");
	});
});

describe("HashGraph for delete wins map tests", () => {
	let obj1: DRPObject<MapDRP<string, string>>;
	let obj2: DRPObject<MapDRP<string, string>>;

	beforeEach(() => {
		obj1 = new DRPObject({
			peerId: "peer1",
			acl,
			drp: new MapDRP<string, string>(MapConflictResolution.DeleteWins),
		});
		obj2 = new DRPObject({
			peerId: "peer2",
			acl,
			drp: new MapDRP<string, string>(MapConflictResolution.DeleteWins),
		});
	});

	test("Should resolve conflict between concurrent set and delete operations that delete wins after merging", async () => {
		/*
		       __ V1:SET("key1", "value1")
		      /
		  ROOT
		      \
		       -- V2:SET("key1", "value2") -- DELETE("key1")
		*/
		obj1.drp?.set("key1", "value1"); // greater hash
		obj2.drp?.set("key1", "value2"); // smaller hash
		obj2.drp?.delete("key1");

		expect(obj1.drp?.query_get("key1")).toBe("value1");
		await obj1.merge(obj2.hashGraph.getAllVertices());
		expect(obj1.drp?.query_get("key1")).toBe(undefined);
	});

	test("Should resolve conflict between concurrent set and delete operations that delete wins after merging complex case", async () => {
		/*
		       __V1:SET("key1", "value2") -- V3:DELETE("key1") -- V5:SET("key2", "value3") -- V6:DELETE("key2")
		      /                          \                      /
		  ROOT                            \____________________/
		      \                           /\
		       --V2:SET("key1", "value1") -- V4:SET("key2", "value3")
		*/

		obj1.drp?.set("key1", "value2");
		obj2.drp?.set("key1", "value1");
		await obj2.merge(obj1.hashGraph.getAllVertices());

		expect(obj2.drp?.query_get("key1")).toBe("value1");
		obj1.drp?.delete("key1");
		await obj1.merge(obj2.hashGraph.getAllVertices());
		expect(obj1.drp?.query_get("key1")).toBe(undefined);

		obj2.drp?.set("key2", "value3");
		obj1.drp?.delete("key2"); // dropped;
		await obj2.merge(obj1.hashGraph.getAllVertices());
		expect(obj2.drp?.query_get("key2")).toBe("value3");

		obj1.drp?.set("key2", "value3");
		obj1.drp?.delete("key2");
		await obj2.merge(obj1.hashGraph.getAllVertices());
		expect(obj1.drp?.query_get("key2")).toBe(undefined);
	});
});

describe("Hash validation tests", () => {
	let obj1: DRPObject<MapDRP<string, string>>;
	let obj2: DRPObject<MapDRP<string, string>>;
	beforeEach(() => {
		obj1 = new DRPObject({
			peerId: "peer1",
			acl,
			drp: new MapDRP<string, string>(),
		});

		obj2 = new DRPObject({
			peerId: "peer2",
			acl,
			drp: new MapDRP<string, string>(),
		});
	});

	test("Should accept vertices with valid hash", async () => {
		obj1.drp?.set("key1", "value1");
		obj2.drp?.set("key2", "value2");

		await obj2.merge(obj1.hashGraph.getAllVertices());
		expect(obj2.vertices.length).toBe(3);
		expect(obj2.hashGraph.getAllVertices().length).toBe(3);
	});

	test("Should ignore vertices with invalid hash", () => {
		obj1.hashGraph.addVertex({
			hash: "hash",
			peerId: "peer1",
			operation: {
				opType: "add",
				value: ["value"],
				drpType: DrpType.DRP,
			},
			dependencies: obj1.hashGraph.getFrontier(),
			timestamp: Date.now(),
			signature: new Uint8Array(),
		});

		expect(obj1.hashGraph.getAllVertices().length).toBe(2);
		expect(obj2.hashGraph.getAllVertices().length).toBe(1);
		expect(obj2.hashGraph.getAllVertices().includes(obj1.hashGraph.getAllVertices()[1])).toBe(false);
	});
});

describe("HashGraph hook tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	beforeEach(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
	});

	test("New operations are hooked from callFn", () => {
		const drp1 = obj1.drp as SetDRP<number>;
		const newVertices: Vertex[] = [];

		obj1.subscribe((_, origin, vertices) => {
			if (origin === "callFn") {
				newVertices.push(...vertices);
			}
		});
		for (let i = 1; i < 100; i++) {
			drp1.add(i);
			expect(newVertices.length).toBe(i);
			expect(newVertices[i - 1].operation?.opType).toBe("add");
			expect(newVertices[i - 1].operation?.value[0]).toBe(i);
		}
	});

	test("Merged operations are hooked from merge", async () => {
		const drp1 = obj1.drp as SetDRP<number>;
		const newVertices: Vertex[] = [];

		obj2.subscribe((_, origin, vertices) => {
			if (origin === "merge") {
				newVertices.push(...vertices);
			}
		});
		for (let i = 1; i < 100; i++) {
			drp1.add(i);
			await obj2.merge(obj1.hashGraph.getAllVertices());
			expect(newVertices.length).toBe(i);
			expect(newVertices[i - 1].operation?.opType).toBe("add");
			expect(newVertices[i - 1].operation?.value[0]).toBe(i);
		}
	});
});

class SetDRPWithContext<T> implements IDRP {
	semanticsType = SemanticsType.pair;
	context: DrpRuntimeContext = { caller: "" };
	private _set: Set<T>;

	constructor() {
		this._set = new Set();
	}

	add(value: T): void {
		this._set.add(value);
	}

	delete(value: T): void {
		this._set.delete(value);
	}

	query_has(value: T): boolean {
		return this._set.has(value);
	}

	query_getValues(): T[] {
		return Array.from(this._set.values());
	}
}

describe("DRP Context tests", () => {
	let obj1: DRPObject<SetDRPWithContext<number>>;
	let obj2: DRPObject<SetDRPWithContext<number>>;
	let obj3: DRPObject<SetDRPWithContext<number>>;

	beforeEach(() => {
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRPWithContext<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRPWithContext<number>() });
		obj3 = new DRPObject({ peerId: "peer3", acl, drp: new SetDRPWithContext<number>() });
	});

	test("caller should be empty if no operation is applied", () => {
		const drp1 = obj1.drp as SetDRPWithContext<number>;
		expect(drp1.context.caller).toBe("");
	});

	test("caller should be current node's peerId if operation is applied locally", () => {
		for (let i = 0; i < 10; i++) {
			obj1.drp?.add(i);
			expect(obj1.drp?.context.caller).toBe("peer1");
		}

		for (let i = 0; i < 10; i++) {
			obj2.drp?.add(i);
			expect(obj2.drp?.context.caller).toBe("peer2");
		}
	});

	test("caller should be the peerId of the node that applied the operation", async () => {
		for (let i = 1; i <= 10; ++i) {
			obj1.drp?.add(i);
			expect(obj1.drp?.context.caller).toBe("peer1");
			await obj2.merge(obj1.hashGraph.getAllVertices());

			obj2.drp?.add(10 + i);
			const vertices2 = obj2.hashGraph.getAllVertices();
			await obj1.merge([vertices2[vertices2.length - 1]]);
			expect(obj1.drp?.context.caller).toBe("peer2");

			await obj3.merge(obj2.hashGraph.getAllVertices());
			obj3.drp?.add(20 + i);
			const vertices3 = obj3.hashGraph.getAllVertices();
			await obj2.merge([vertices3[vertices3.length - 1]]);
			expect(obj2.drp?.context.caller).toBe("peer3");
			await obj1.merge([vertices3[vertices3.length - 1]]);
			expect(obj1.drp?.context.caller).toBe("peer3");
		}
	});

	test("should not update the caller if the state is not changed", async () => {
		for (let i = 0; i < 10; ++i) {
			if (i % 2 === 0) {
				obj1.drp?.add(i);
				expect(obj1.drp?.context.caller).toBe("peer1");
				await obj2.merge(obj1.hashGraph.getAllVertices());
				expect(obj2.drp?.context.caller).toBe("peer1");
				obj2.drp?.add(i);
				expect(obj2.drp?.context.caller).toBe("peer1");
			} else {
				obj2.drp?.add(i);
				expect(obj2.drp?.context.caller).toBe("peer2");
				await obj1.merge(obj2.hashGraph.getAllVertices());
				expect(obj1.drp?.context.caller).toBe("peer2");
				obj1.drp?.add(i);
				expect(obj1.drp?.context.caller).toBe("peer2");
			}
		}
	});
});

describe("Nodes admin permission tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	let obj3: DRPObject<SetDRP<number>>;

	beforeEach(() => {
		obj1 = new DRPObject({
			peerId: "peer1",
			acl: new ObjectACL({ admins: ["peer1"] }),
			drp: new SetDRP<number>(),
		});
		obj2 = new DRPObject({
			peerId: "peer2",
			acl: new ObjectACL({ admins: ["peer1", "peer2"] }),
			drp: new SetDRP<number>(),
		});
		obj3 = new DRPObject({
			peerId: "peer3",
			acl: new ObjectACL({ admins: ["peer1"] }),
			drp: new SetDRP<number>(),
		});
	});

	test("Should not able to grant if node an admin", async () => {
		obj2.acl.grant("peer3", ACLGroup.Writer);
		expect(obj2.acl.query_isWriter("peer3")).toBe(true);

		await obj1.merge(obj2.vertices);
		expect(obj1.acl.query_isWriter("peer3")).toBe(false);
		await obj3.merge(obj2.vertices);
		expect(obj3.acl.query_isWriter("peer3")).toBe(false);
	});

	test("Should not able to revoke if node an admin", async () => {
		obj1.acl.grant("peer3", ACLGroup.Writer);
		expect(obj1.acl.query_isWriter("peer3")).toBe(true);

		await obj3.merge(obj1.vertices);
		expect(obj3.acl.query_isWriter("peer3")).toBe(true);
		obj3.drp?.add(1);
		expect(obj3.drp?.query_has(1)).toBe(true);

		await obj2.merge(obj3.vertices);
		expect(obj2.drp?.query_has(1)).toBe(true);
		obj2.acl.revoke("peer3", ACLGroup.Writer);
		expect(obj2.acl.query_isWriter("peer3")).toBe(false);

		await obj3.merge(obj2.vertices);
		expect(obj3.acl.query_isWriter("peer3")).toBe(true);
	});

	test("Should able to grant/revoke if node an admin", async () => {
		obj1.acl.grant("peer3", ACLGroup.Writer);
		expect(obj1.acl.query_isWriter("peer3")).toBe(true);
		await obj3.merge(obj1.vertices);
		obj1.acl.grant("peer2", ACLGroup.Admin);
		await obj2.merge(obj1.vertices);

		obj3.drp?.add(1);
		await obj2.merge(obj3.vertices);
		expect(obj2.drp?.query_has(1)).toBe(true);
		obj2.acl.revoke("peer3", ACLGroup.Writer);
		obj2.acl.grant("peer3", ACLGroup.Finality);

		await obj1.merge(obj2.vertices);
		expect(obj1.acl.query_isWriter("peer3")).toBe(false);
		expect(obj1.acl.query_isFinalitySigner("peer3")).toBe(true);
	});
});
