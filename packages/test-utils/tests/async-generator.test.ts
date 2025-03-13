import { ActionType } from "@ts-drp/types";
import { beforeEach, describe, expect, it } from "vitest";

import { AsyncCounterDRP } from "../src/async-generator.js";

describe("AsyncCounterDRP", () => {
	let counter: AsyncCounterDRP;

	beforeEach(() => {
		counter = new AsyncCounterDRP();
	});

	it("should initialize with default value of 0", () => {
		expect(counter.query_value()).toBe(0);
	});

	it("should initialize with custom initial value", () => {
		const initialValue = 5;
		const customCounter = new AsyncCounterDRP(initialValue);
		expect(customCounter.query_value()).toBe(initialValue);
	});

	it("increment should increase value by 1", async () => {
		const initialValue = counter.query_value();
		const newValue = await counter.increment();

		expect(newValue).toBe(initialValue + 1);
		expect(counter.query_value()).toBe(initialValue + 1);
	});

	it("decrement should decrease value by 1", async () => {
		const initialValue = counter.query_value();
		const newValue = await counter.decrement();

		expect(newValue).toBe(initialValue - 1);
		expect(counter.query_value()).toBe(initialValue - 1);
	});

	it("multiple increments should work correctly", async () => {
		await counter.increment();
		await counter.increment();
		await counter.increment();

		expect(counter.query_value()).toBe(3);
	});

	it("multiple decrements should work correctly", async () => {
		await counter.decrement();
		await counter.decrement();
		await counter.decrement();

		expect(counter.query_value()).toBe(-3);
	});

	it("resolveConflicts should return Nop action", () => {
		const conflictResolution = counter.resolveConflicts();

		expect(conflictResolution).toEqual({ action: ActionType.Nop });
	});
});
