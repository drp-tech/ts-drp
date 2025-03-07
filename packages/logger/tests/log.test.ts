import { beforeEach, describe, expect, test } from "vitest";

import { Logger } from "../src/index.js";

describe("Logger test", () => {
	let logger: Logger;
	beforeEach(() => {
		logger = new Logger("logger_test");
	});
	test("should be a function", () => {
		expect(typeof Logger).toBe("function");
	});

	test("should be constructor", () => {
		expect(logger).toBeInstanceOf(Logger);
	});
});
