import { SetDRP } from "@ts-drp/blueprints/src/index.js";
import { DRPObject } from "@ts-drp/object/src/index.js";
import { beforeAll, describe, expect, test } from "vitest";

import { deserializeStateMessage, serializeStateMessage } from "../src/utils.js";

describe("State message utils", () => {
	let object: DRPObject;

	beforeAll(() => {
		object = DRPObject.createObject({
			peerId: "test",
			id: "test",
			drp: new SetDRP<number>(),
		});
		(object.drp as SetDRP<number>).add(1);
		(object.drp as SetDRP<number>).add(2);
		(object.drp as SetDRP<number>).add(3);
	});

	test("Should serialize/deserialize state message", () => {
		const state = object["_computeDRPState"].bind(object);
		const serialized = serializeStateMessage(state(object.hashGraph.getFrontier()));
		const deserialized = deserializeStateMessage(serialized);
		expect(deserialized).toStrictEqual(state(object.hashGraph.getFrontier()));
	});
});
