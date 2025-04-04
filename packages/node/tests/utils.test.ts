import { SetDRP } from "@ts-drp/blueprints";
import { createObject } from "@ts-drp/object";
import { deserializeDRPState, serializeDRPState } from "@ts-drp/utils/serialization";
import { describe, expect, test } from "vitest";

describe("State message utils", () => {
	test("Should serialize/deserialize state message", () => {
		const object = createObject({
			peerId: "test",
			id: "test",
			drp: new SetDRP<number>(),
		});
		object.drp?.add(1);
		object.drp?.add(2);
		object.drp?.add(3);

		const vertices = object.vertices;
		const [drpState] = object.getStates(vertices[vertices.length - 1].hash);
		const serialized = serializeDRPState(drpState);
		const deserialized = deserializeDRPState(serialized);
		expect(deserialized).toStrictEqual(drpState);
	});
});
