import type { DRPNodeConfig } from "@ts-drp/types";
import * as dotenv from "dotenv";
import fs from "node:fs";

function parseCommaSeparatedValue(value: string | undefined): string[] | undefined {
	if (value === undefined) return undefined;
	return value === "" ? [] : value.split(",");
}

/**
 * Load the configuration for the DRP node.
 * @param configPath - The path to the configuration file.
 * @returns The configuration for the DRP node.
 */
export function loadConfig(configPath?: string | undefined): DRPNodeConfig | undefined {
	let config: DRPNodeConfig | undefined;

	if (configPath) {
		try {
			config = JSON.parse(fs.readFileSync(configPath, "utf8"));
			return config;
		} catch (error) {
			console.error(`Failed to load config from ${configPath}:`, error);
			throw error;
		}
	}

	dotenv.config();

	const hasEnvConfig = [
		"LISTEN_ADDRESSES",
		"ANNOUNCE_ADDRESSES",
		"BOOTSTRAP",
		"BOOTSTRAP_PEERS",
		"BROWSER_METRICS",
		"PRIVATE_KEY_SEED",
	].some((key) => process.env[key] !== undefined);

	if (!hasEnvConfig) {
		return undefined;
	}

	config = {};
	config.network_config = {
		listen_addresses: parseCommaSeparatedValue(process.env.LISTEN_ADDRESSES),
		announce_addresses: parseCommaSeparatedValue(process.env.ANNOUNCE_ADDRESSES),
		bootstrap: process.env.BOOTSTRAP ? process.env.BOOTSTRAP === "true" : undefined,
		bootstrap_peers: parseCommaSeparatedValue(process.env.BOOTSTRAP_PEERS),
		browser_metrics: process.env.BROWSER_METRICS ? process.env.BROWSER_METRICS === "true" : undefined,
	};
	config.keychain_config = {
		private_key_seed: process.env.PRIVATE_KEY_SEED ? process.env.PRIVATE_KEY_SEED : undefined,
	};
	return config;
}
