import { SetDRP } from "@ts-drp/blueprints";
import { DrpType, Operation } from "@ts-drp/types";
import { InvalidDependenciesError, InvalidTimestampError, validateVertex } from "@ts-drp/validation";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createACL, createVertex, DRPObject } from "../src/index.js";

describe("Vertex validation tests", () => {
	let obj1: DRPObject<SetDRP<number>>;
	let obj2: DRPObject<SetDRP<number>>;
	let obj3: DRPObject<SetDRP<number>>;
	const acl = createACL({ admins: ["peer1", "peer2", "peer3"] });

	beforeEach(() => {
		vi.useFakeTimers({ now: 0 });
		obj1 = new DRPObject({ peerId: "peer1", acl, drp: new SetDRP<number>() });
		obj2 = new DRPObject({ peerId: "peer2", acl, drp: new SetDRP<number>() });
		obj3 = new DRPObject({ peerId: "peer3", acl, drp: new SetDRP<number>() });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("Should validate vertices with invalid dependencies", () => {
		const drp1 = obj1.drp as SetDRP<number>;
		drp1.add(1);
		const fakeRoot = createVertex(
			"peer1",
			Operation.create({ opType: "root", value: null, drpType: DrpType.DRP }),
			[],
			Date.now(),
			new Uint8Array()
		);
		expect(validateVertex(fakeRoot, obj1["hashGraph"], Date.now())).toStrictEqual({
			success: false,
			error: new InvalidDependenciesError(`Vertex ${fakeRoot.hash} has no dependencies.`),
		});
		const vertex = createVertex(
			"peer1",
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			[fakeRoot.hash],
			Date.now(),
			new Uint8Array()
		);
		expect(validateVertex(vertex, obj1["hashGraph"], Date.now())).toStrictEqual({
			success: false,
			error: new InvalidDependenciesError(`Vertex ${vertex.hash} has invalid dependency ${fakeRoot.hash}.`),
		});
	});

	test("Test: Vertex created in the future is invalid", () => {
		const drp1 = obj1.drp as SetDRP<number>;

		drp1.add(1);

		const vertex = createVertex(
			"peer1",
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			obj1["hashGraph"].getFrontier(),
			Number.POSITIVE_INFINITY,
			new Uint8Array()
		);
		expect(validateVertex(vertex, obj1["hashGraph"], Date.now())).toStrictEqual({
			success: false,
			error: new InvalidTimestampError(`Vertex ${vertex.hash} has invalid timestamp Infinity - 0 = Infinity > 100`),
		});
	});

	test("Test: Vertex's timestamp must not be less than any of its dependencies' timestamps", async () => {
		/*
		        __ V1:ADD(1) __
		       /               \
		  ROOT -- V2:ADD(2) ---- V4:ADD(4) (invalid)
		       \               /
		        -- V3:ADD(3) --
		*/

		const drp1 = obj1.drp as SetDRP<number>;
		const drp2 = obj2.drp as SetDRP<number>;
		const drp3 = obj2.drp as SetDRP<number>;

		vi.advanceTimersByTime(1000);
		drp1.add(1);
		drp2.add(2);
		drp3.add(3);

		await obj1.merge(obj2.vertices);
		await obj1.merge(obj3.vertices);

		const vertex = createVertex(
			"peer1",
			Operation.create({ opType: "add", value: [1], drpType: DrpType.DRP }),
			obj1["hashGraph"].getFrontier(),
			1,
			new Uint8Array()
		);
		expect(validateVertex(vertex, obj1["hashGraph"], Date.now())).toStrictEqual({
			success: false,
			error: new InvalidTimestampError(`Vertex ${vertex.hash} has invalid timestamp 1000 - 1 = 999 > 100`),
		});
	});
});
