import * as dotenv from "dotenv";
import fs from "node:fs";

import type { DRPNodeConfig } from "./index.js";

export function loadConfig(configPath?: string | undefined): DRPNodeConfig | undefined {
	let config: DRPNodeConfig | undefined;

	if (configPath) {
		config = JSON.parse(fs.readFileSync(configPath, "utf8"));
		return config;
	}

	const result = dotenv.config();
	if (!result.error) {
		config = {};
		config.network_config = {
			listen_addresses: process.env.LISTEN_ADDRESSES
				? process.env.LISTEN_ADDRESSES.split(",")
				: undefined,
			announce_addresses: process.env.ANNOUNCE_ADDRESSES
				? process.env.ANNOUNCE_ADDRESSES.split(",")
				: undefined,
			bootstrap: process.env.BOOTSTRAP ? process.env.BOOTSTRAP === "true" : undefined,
			bootstrap_peers: process.env.BOOTSTRAP_PEERS
				? process.env.BOOTSTRAP_PEERS.split(",")
				: undefined,
			browser_metrics: process.env.BROWSER_METRICS
				? process.env.BROWSER_METRICS === "true"
				: undefined,
		};
		config.keychain_config = {
			private_key_seed: process.env.PRIVATE_KEY_SEED ? process.env.PRIVATE_KEY_SEED : undefined,
		};
		return config;
	}

	return config;
}
