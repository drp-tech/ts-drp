import { type Operation } from "@ts-drp/types";
import { describe, expect, it } from "vitest";

import { computeHash } from "../src/hash/index.js";

describe("computeHash", () => {
	// Basic functionality test
	it("should generate a hash for valid inputs", () => {
		const peerId = "peer-123";
		const operation: Operation = {
			drpType: "set",
			opType: "add",
			value: "test",
		};
		const deps: string[] = [];
		const timestamp = 1714503551112; // Fixed timestamp for deterministic test

		const hash = computeHash(peerId, operation, deps, timestamp);

		// Hash should be a non-empty string
		expect(hash).toBeTruthy();
		expect(typeof hash).toBe("string");
		expect(hash.length).toBe(64); // SHA-256 produces a 32-byte (64 hex chars) hash
	});

	// Deterministic output test
	it("should produce the same hash for same inputs", () => {
		const peerId = "peer-456";
		const operation: Operation = {
			drpType: "set",
			opType: "add",
			value: "test",
		};
		const deps: string[] = ["hash1", "hash2"];
		const timestamp = 1714503551113;

		const hash1 = computeHash(peerId, operation, deps, timestamp);
		const hash2 = computeHash(peerId, operation, deps, timestamp);

		expect(hash1).toBe(hash2);
	});

	// Different inputs should produce different outputs
	it("should produce different hashes for different inputs", () => {
		const peerId = "peer-789";
		const timestamp = 1714503551114;
		const deps: string[] = [];

		const operation1: Operation = {
			drpType: "set",
			opType: "add",
			value: "test1",
		};

		const operation2: Operation = {
			drpType: "set",
			opType: "add",
			value: "test2",
		};

		const hash1 = computeHash(peerId, operation1, deps, timestamp);
		const hash2 = computeHash(peerId, operation2, deps, timestamp);

		expect(hash1).not.toBe(hash2);
	});

	// Test with undefined operation
	it("should handle undefined operation", () => {
		const peerId = "peer-abc";
		const deps: string[] = ["hash-xyz"];
		const timestamp = 1714503551115;

		const hash = computeHash(peerId, undefined, deps, timestamp);

		expect(hash).toBeTruthy();
		expect(typeof hash).toBe("string");
		expect(hash.length).toBe(64);
	});

	// Test with complex dependencies
	it("should handle complex dependencies", () => {
		const peerId = "peer-def";
		const operation: Operation = {
			drpType: "set",
			opType: "add",
			value: "test",
		};
		const deps: string[] = [
			"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
			"abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
		];
		const timestamp = 1714503551116;

		const hash = computeHash(peerId, operation, deps, timestamp);

		expect(hash).toBeTruthy();
		expect(hash.length).toBe(64);
	});

	// Test order sensitivity of dependencies
	it("should be sensitive to the order of dependencies", () => {
		const peerId = "peer-ghi";
		const operation: Operation = {
			drpType: "set",
			opType: "add",
			value: "test",
		};
		const deps1: string[] = ["hash1", "hash2"];
		const deps2: string[] = ["hash2", "hash1"]; // Reversed order
		const timestamp = 1714503551117;

		const hash1 = computeHash(peerId, operation, deps1, timestamp);
		const hash2 = computeHash(peerId, operation, deps2, timestamp);

		// Different order of dependencies should result in different hashes
		expect(hash1).not.toBe(hash2);
	});

	// Test with complex operation
	it("should handle complex operation objects", () => {
		const peerId = "peer-jkl";
		const operation: Operation = {
			drpType: "set",
			opType: "add",
			value: "test",
		};
		const deps: string[] = [];
		const timestamp = 1714503551118;

		const hash = computeHash(peerId, operation, deps, timestamp);

		expect(hash).toBeTruthy();
		expect(hash.length).toBe(64);
	});

	// Test timestamp sensitivity
	it("should be sensitive to timestamp changes", () => {
		const peerId = "peer-mno";
		const operation: Operation = {
			drpType: "set",
			opType: "add",
			value: "test",
		};
		const deps: string[] = [];

		const hash1 = computeHash(peerId, operation, deps, 1714503551119);
		const hash2 = computeHash(peerId, operation, deps, 1714503551120);

		expect(hash1).not.toBe(hash2);
	});

	// Test peer ID sensitivity
	it("should be sensitive to peer ID changes", () => {
		const operation: Operation = {
			drpType: "set",
			opType: "add",
			value: "test",
		};
		const deps: string[] = [];
		const timestamp = 1714503551121;

		const hash1 = computeHash("peer-pqr", operation, deps, timestamp);
		const hash2 = computeHash("peer-stu", operation, deps, timestamp);

		expect(hash1).not.toBe(hash2);
	});
});
