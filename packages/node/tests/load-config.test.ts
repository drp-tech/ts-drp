import type { DRPNodeConfig } from "@ts-drp/types";
import fs from "node:fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
	const tempConfigPath = path.join(__dirname, "temp-config.json");

	beforeEach(() => {
		// Clear any existing env vars that might interfere with tests
		delete process.env.LISTEN_ADDRESSES;
		delete process.env.ANNOUNCE_ADDRESSES;
		delete process.env.BOOTSTRAP;
		delete process.env.BOOTSTRAP_PEERS;
		delete process.env.BROWSER_METRICS;
		delete process.env.PRIVATE_KEY_SEED;
	});

	afterEach(() => {
		// Clean up temp file if it exists
		if (fs.existsSync(tempConfigPath)) {
			fs.unlinkSync(tempConfigPath);
		}
	});

	it("should load config from JSON file when configPath is provided", () => {
		const testConfig: DRPNodeConfig = {
			network_config: {
				listen_addresses: ["addr1", "addr2"],
				announce_addresses: ["announce1"],
				bootstrap: true,
				bootstrap_peers: ["peer1", "peer2"],
				browser_metrics: false,
			},
			keychain_config: {
				private_key_seed: "test-seed",
			},
		};

		fs.writeFileSync(tempConfigPath, JSON.stringify(testConfig));
		const loadedConfig = loadConfig(tempConfigPath);
		expect(loadedConfig).toEqual(testConfig);
	});

	it("should throw error when JSON file is invalid", () => {
		fs.writeFileSync(tempConfigPath, "invalid json content");
		expect(() => loadConfig(tempConfigPath)).toThrow();
	});

	it("should throw error when config file does not exist", () => {
		const nonExistentPath = path.join(__dirname, "non-existent.json");
		expect(() => loadConfig(nonExistentPath)).toThrow();
	});

	it("should load config from environment variables when no configPath is provided", () => {
		process.env.LISTEN_ADDRESSES = "addr1,addr2";
		process.env.ANNOUNCE_ADDRESSES = "announce1";
		process.env.BOOTSTRAP_PEERS = "peer1,peer2";
		process.env.BROWSER_METRICS = "false";
		process.env.PRIVATE_KEY_SEED = "test-seed";

		const expectedConfig: DRPNodeConfig = {
			network_config: {
				listen_addresses: ["addr1", "addr2"],
				announce_addresses: ["announce1"],
				bootstrap: undefined,
				bootstrap_peers: ["peer1", "peer2"],
				browser_metrics: false,
			},
			keychain_config: {
				private_key_seed: "test-seed",
			},
		};

		const loadedConfig = loadConfig();
		expect(loadedConfig).toEqual(expectedConfig);
	});

	it("should handle missing environment variables by setting them to undefined", () => {
		process.env.LISTEN_ADDRESSES = "addr1,addr2";
		process.env.BOOTSTRAP = "true";
		process.env.BOOTSTRAP_PEERS = "";

		const expectedConfig: DRPNodeConfig = {
			network_config: {
				listen_addresses: ["addr1", "addr2"],
				announce_addresses: undefined,
				bootstrap: true,
				bootstrap_peers: [],
				browser_metrics: undefined,
			},
			keychain_config: {
				private_key_seed: undefined,
			},
		};

		const loadedConfig = loadConfig();
		expect(loadedConfig).toEqual(expectedConfig);
	});

	it("should return undefined when no environment variables are set", () => {
		const loadedConfig = loadConfig();
		expect(loadedConfig).toBeUndefined();
	});

	it("should handle boolean environment variables correctly", () => {
		process.env.LISTEN_ADDRESSES = "addr1";
		process.env.BOOTSTRAP = "false";
		process.env.BROWSER_METRICS = "anything-non-true";

		const expectedConfig: DRPNodeConfig = {
			network_config: {
				listen_addresses: ["addr1"],
				announce_addresses: undefined,
				bootstrap: false,
				bootstrap_peers: undefined,
				browser_metrics: false,
			},
			keychain_config: {
				private_key_seed: undefined,
			},
		};

		const loadedConfig = loadConfig();
		expect(loadedConfig).toEqual(expectedConfig);
	});
});
