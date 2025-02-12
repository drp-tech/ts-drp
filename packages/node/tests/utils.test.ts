import { SetDRP } from "@ts-drp/blueprints/src/index.js";
import { DRPObject } from "@ts-drp/object/src/index.js";
import { beforeAll, describe, test } from "vitest";

import { deserializeStateMessage, serializeStateMessage } from "../src/utils.js";

describe("State message utils", () => {
	let object: DRPObject;

	beforeAll(async () => {
		object = DRPObject.createObject({
			peerId: "test",
			id: "test",
			drp: new SetDRP<number>(),
		});
		(object.drp as SetDRP<number>).add(1);
		(object.drp as SetDRP<number>).add(2);
		(object.drp as SetDRP<number>).add(3);
	});

	test("Should serialize/deserialize state message", async () => {
		const state = object["_computeDRPState"].bind(object);
		const serialized = serializeStateMessage(state(object.hashGraph.getFrontier()));
		console.log(serialized);
		const deserialized = deserializeStateMessage(serialized);
		console.log(deserialized);
		// expect(deserialized).toBe(state(object.hashGraph.getFrontier()));
	});
});
