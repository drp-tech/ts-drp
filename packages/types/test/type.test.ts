import { describe, expect, test } from "vitest";

import { Message } from "../dist/src/index.js";

describe("Type", () => {
	test("should be an object", () => {
		expect(typeof Message).toBe("object");
	});
});
