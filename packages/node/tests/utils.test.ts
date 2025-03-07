import { SetDRP } from "@ts-drp/blueprints";
import { DRPObject, deserializeDRPState, serializeDRPState } from "@ts-drp/object";
import { beforeAll, describe, expect, test } from "vitest";

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
		const serialized = serializeDRPState(state(object.hashGraph.getFrontier()));
		const deserialized = deserializeDRPState(serialized);
		expect(deserialized).toStrictEqual(state(object.hashGraph.getFrontier()));
	});
});
