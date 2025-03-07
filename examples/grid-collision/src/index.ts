import { DRPNode } from "@ts-drp/node";
import { ObjectACL } from "@ts-drp/object";

import { Grid } from "./objects/grid";
import { render, enableUIControls, renderInfo } from "./render";
import { gridState } from "./state";
import { getColorForPeerId } from "./util/color";

export function getNetworkConfigFromEnv() {
	const hasBootstrapPeers = Boolean(import.meta.env.VITE_BOOTSTRAP_PEERS);
	const hasDiscoveryInterval = Boolean(import.meta.env.VITE_DISCOVERY_INTERVAL);
	const hasPubsubPruneBackoff = Boolean(import.meta.env.VITE_PUBSUB_PRUNE_BACKOFF);
	const hasPubsubHeartbeatInterval = Boolean(import.meta.env.VITE_PUBSUB_HEARTBEAT_INTERVAL);

	const hasEnv =
		hasBootstrapPeers ||
		hasDiscoveryInterval ||
		hasPubsubPruneBackoff ||
		hasPubsubHeartbeatInterval;

	const config: Record<string, unknown> = {
		browser_metrics: true,
	};

	if (!hasEnv) {
		return config;
	}

	if (hasBootstrapPeers) {
		config.bootstrap_peers = import.meta.env.VITE_BOOTSTRAP_PEERS.split(",");
	}

	if (hasDiscoveryInterval) {
		config.pubsub = {
			peer_discovery_interval: import.meta.env.VITE_DISCOVERY_INTERVAL,
		};
	}

	if (hasPubsubPruneBackoff) {
		config.pubsub = {
			...(config.pubsub || {}),
			prune_backoff: import.meta.env.VITE_PUBSUB_PRUNE_BACKOFF,
		};
	}

	if (hasPubsubHeartbeatInterval) {
		config.pubsub = {
			...(config.pubsub || {}),
			heartbeat_interval: import.meta.env.VITE_PUBSUB_HEARTBEAT_INTERVAL,
		};
	}

	return config;
}

async function addUser() {
	if (!gridState.gridDRP) {
		console.error("Grid DRP not initialized");
		alert("Please create or join a grid first");
		return;
	}

	gridState.gridDRP.addUser(
		gridState.node.networkNode.peerId,
		getColorForPeerId(gridState.node.networkNode.peerId)
	);

	// This is here to check disqualification of new nodes.
	setInterval(() => {
		if (gridState.gridDRP) {
			const userExist = gridState.gridDRP
				.query_users()
				.find((u) => u.startsWith(`${gridState.node.networkNode.peerId}:`));
			if (!userExist) {
				gridState.gridDRP.addUser(
					gridState.node.networkNode.peerId,
					getColorForPeerId(gridState.node.networkNode.peerId)
				);
				render();
			}
		}
	}, 1000);
	render();
}

function moveUser(direction: string) {
	if (!gridState.gridDRP) {
		console.error("Grid DRP not initialized");
		alert("Please create or join a grid first");
		return;
	}

	gridState.gridDRP?.moveUser(gridState.node.networkNode.peerId, direction);
	render();
}

async function createConnectHandlers() {
	if (gridState.drpObject)
		gridState.objectPeers = gridState.node.networkNode.getGroupPeers(gridState.drpObject.id);

	if (!gridState.drpObject?.id) return;

	gridState.node.addCustomGroupMessageHandler(gridState.drpObject?.id, () => {
		if (!gridState.drpObject?.id) return;
		gridState.objectPeers = gridState.node.networkNode.getGroupPeers(gridState.drpObject?.id);
		render();
	});

	gridState.node.objectStore.subscribe(gridState.drpObject?.id, () => {
		render();
	});
}

async function run() {
	enableUIControls();
	renderInfo();

	const button_create = <HTMLButtonElement>document.getElementById("createGrid");
	button_create.addEventListener("click", async () => {
		gridState.drpObject = await gridState.node.createObject({
			drp: new Grid(),
			acl: new ObjectACL({
				admins: new Map(),
				permissionless: true,
			}),
		});
		gridState.gridDRP = gridState.drpObject.drp as Grid;
		await createConnectHandlers();
		await addUser();
		render();
	});

	const button_connect = <HTMLButtonElement>document.getElementById("joinGrid");
	button_connect.addEventListener("click", async () => {
		const drpId = (<HTMLInputElement>document.getElementById("gridInput")).value;
		try {
			gridState.drpObject = await gridState.node.connectObject({
				id: drpId,
				drp: new Grid(),
			});
			gridState.gridDRP = gridState.drpObject.drp as Grid;
			await createConnectHandlers();
			await addUser();
			render();
			console.log("Succeeded in connecting with DRP", drpId);
		} catch (e) {
			console.error("Error while connecting with DRP", drpId, e);
		}
	});

	document.addEventListener("keydown", async (event) => {
		if (event.key === "w") moveUser("U");
		if (event.key === "a") moveUser("L");
		if (event.key === "s") moveUser("D");
		if (event.key === "d") moveUser("R");
	});

	const copyButton = <HTMLButtonElement>document.getElementById("copyGridId");
	copyButton.addEventListener("click", () => {
		const gridIdText = (<HTMLSpanElement>document.getElementById("gridId")).innerText;
		navigator.clipboard
			.writeText(gridIdText)
			.then(() => {
				console.log("Grid DRP ID copied to clipboard");
			})
			.catch((err) => {
				console.error("Failed to copy: ", err);
			});
	});
}

async function main() {
	const networkConfig = getNetworkConfigFromEnv();
	gridState.node = new DRPNode(networkConfig ? { network_config: networkConfig } : undefined);
	await gridState.node.start();
	await gridState.node.networkNode.isDialable(async () => {
		console.log("Started node", import.meta.env);
		await run();
	});

	setInterval(renderInfo, import.meta.env.VITE_RENDER_INFO_INTERVAL);
}

void main();
