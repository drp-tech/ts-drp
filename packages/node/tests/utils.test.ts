import { SetDRP } from "@ts-drp/blueprints";
import { deserializeDRPState, DRPObject, serializeDRPState } from "@ts-drp/object";
import { beforeAll, describe, expect, test } from "vitest";

describe("State message utils", () => {
	let object: DRPObject<SetDRP<number>>;

	beforeAll(() => {
		object = DRPObject.createObject({
			peerId: "test",
			id: "test",
			drp: new SetDRP<number>(),
		});
		object.drp?.add(1);
		object.drp?.add(2);
		object.drp?.add(3);
	});

	test("Should serialize/deserialize state message", () => {
		const state = object["_computeDRPState"].bind(object);
		const serialized = serializeDRPState(state(object.hashGraph.getFrontier()));
		const deserialized = deserializeDRPState(serialized);
		expect(deserialized).toStrictEqual(state(object.hashGraph.getFrontier()));
	});
});
