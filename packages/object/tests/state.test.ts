import { SetDRP } from "@ts-drp/blueprints";
import { ACLGroup } from "@ts-drp/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createACL } from "../src/acl/index.js";
import { createDRPVertexApplier } from "../src/drp-applier.js";
import { HashGraph } from "../src/hashgraph/index.js";
import { DRPObject } from "../src/index.js";

describe("HashGraph construction tests", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: 0 });
	});

	test.concurrent("Root vertex drp state should not be modified", () => {
		const acl = createACL({ admins: ["peer1", "peer2"] });
		const obj = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj.drp?.add(1);
		obj.drp?.add(2);
		const rootDRPState = obj["_states"]["drpStates"].get(HashGraph.rootHash);
		expect(rootDRPState?.state.filter((e) => e.key === "_set")[0].value.size).toBe(0);
		const frontierState = obj["_states"]["drpStates"].get(obj["hashgraph"].getFrontier()[0]);
		expect(frontierState?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(frontierState?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
	});

	test.concurrent("Root vertex acl state should not be modified", () => {
		const acl = createACL({ admins: ["peer1", "peer2"] });
		const obj = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj.acl.grant("peer3", ACLGroup.Writer);
		expect(obj.acl.query_isWriter("peer3")).toBe(true);
		const rootACLState = obj["_states"]["aclStates"].get(HashGraph.rootHash);
		const authorizedPeers = rootACLState?.state.filter((e) => e.key === "_authorizedPeers")[0].value;
		expect(authorizedPeers.get("peer1")?.permissions.has(ACLGroup.Admin)).toBe(true);
		expect(authorizedPeers.get("peer3")).toBe(undefined);
	});

	test("Test: Vertex states work correctly with single HashGraph", () => {
		/*
		  ROOT -- V1:ADD(1) -- V2:ADD(2) -- V3:ADD(3)
		*/
		const acl = createACL({ admins: ["peer1"] });
		const [obj, state, hg] = createDRPVertexApplier({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj.drp?.add(1);
		vi.advanceTimersByTime(1);
		obj.drp?.add(2);
		vi.advanceTimersByTime(1);
		obj.drp?.add(3);

		const vertices = hg.topologicalSort();

		const drpState1 = state.getDRPState(vertices[1]);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(false);
		expect(drpState1?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);

		const drpState2 = state.getDRPState(vertices[2]);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState2?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(false);

		const drpState3 = state.getDRPState(vertices[3]);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(1)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(2)).toBe(true);
		expect(drpState3?.state.filter((e) => e.key === "_set")[0].value.has(3)).toBe(true);
	});
});
