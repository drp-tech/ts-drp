import { describe, expect, it } from "vitest";

import { formatOutput } from "../src/memory-benchmark/index.js";

describe("Memory benchmark util tests", () => {
	describe("formatOutput", () => {
		it("should correctly format output with default normalizing factor", () => {
			const observations = [100, 200, 300];
			const result = formatOutput("Test Benchmark", observations, "MB");

			expect(result).toMatch(/Test Benchmark x 200\.00 MB ±40\.82% \(3 runs sampled\)/);
		});

		it("should correctly format output with custom normalizing factor", () => {
			const observations = [1000, 2000, 3000];
			const normalizingFactor = 10;
			const result = formatOutput("Test Benchmark", observations, "MB", normalizingFactor);

			expect(result).toMatch(/Test Benchmark x 200\.00 MB ±40\.82% \(3 runs sampled\)/);
		});

		it("should handle single observation", () => {
			const observations = [100];
			const result = formatOutput("Single Observation", observations, "KB");

			expect(result).toMatch(/Single Observation x 100\.00 KB ±0\.00% \(1 runs sampled\)/);
		});

		it("should handle negative values correctly", () => {
			const observations = [-100, -200, -300];
			const result = formatOutput("Negative Values", observations, "delta");

			expect(result).toMatch(/Negative Values x -200\.00 delta ±40\.82% \(3 runs sampled\)/);
		});

		it("should handle zeroes", () => {
			const observations = [0, 0, 0];
			const result = formatOutput("Zero Values", observations, "units");

			expect(result).toMatch(/Zero Values x 0\.00 units ±0\.00% \(3 runs sampled\)/);
		});

		it("should handle mixed positive and negative values", () => {
			const observations = [-100, 0, 100];
			const result = formatOutput("Mixed Values", observations, "delta");

			expect(result).toContain("Mixed Values x 0.00 delta");
		});

		it("should handle floating point values", () => {
			const observations = [1.5, 2.5, 3.5];
			const result = formatOutput("Floating Values", observations, "ms");

			expect(result).toMatch(/Floating Values x 2\.50 ms ±32\.66% \(3 runs sampled\)/);
		});

		it("should handle large arrays of observations", () => {
			const observations = Array(1000).fill(100);
			const result = formatOutput("Large Array", observations, "MB");

			expect(result).toMatch(/Large Array x 100\.00 MB ±0\.00% \(1000 runs sampled\)/);
		});
	});
});
