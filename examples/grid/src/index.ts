import { DRPNode } from "@ts-drp/node";
import { enableTracing, type IMetrics, OpentelemetryMetrics } from "@ts-drp/tracer";

import { env } from "./env";
import { Grid } from "./objects/grid";
import { render, enableUIControls, renderInfo } from "./render";
import { gridState } from "./state";
import { getColorForPeerId } from "./util/color";

export function getNetworkConfigFromEnv() {
	const hasBootstrapPeers = env.bootstrapPeers;
	const hasDiscoveryInterval = env.discoveryInterval;

	const hasEnv = hasBootstrapPeers || hasDiscoveryInterval;

	const config: Record<string, unknown> = {
		browser_metrics: true,
	};

	if (!hasEnv) {
		return config;
	}

	if (hasBootstrapPeers) {
		config.bootstrap_peers = env.bootstrapPeers.split(",");
	}

	if (hasDiscoveryInterval) {
		config.pubsub = {
			peer_discovery_interval: env.discoveryInterval,
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

async function run(metrics?: IMetrics) {
	enableUIControls();
	renderInfo();

	const button_create = <HTMLButtonElement>document.getElementById("createGrid");
	button_create.addEventListener("click", async () => {
		gridState.drpObject = await gridState.node.createObject({
			drp: new Grid(),
			metrics,
		});
		gridState.gridDRP = gridState.drpObject.drp as Grid;
		await createConnectHandlers();
		await addUser();
		render();
	});

	const button_connect = <HTMLButtonElement>document.getElementById("joinGrid");
	const grid_input = <HTMLInputElement>document.getElementById("gridInput");
	grid_input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			button_connect.click();
		}
	});
	button_connect.addEventListener("click", async () => {
		const drpId = grid_input.value;
		try {
			gridState.drpObject = await gridState.node.connectObject({
				id: drpId,
				drp: new Grid(),
				metrics,
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
	let metrics: IMetrics | undefined = undefined;
	if (env.enableTracing) {
		enableTracing();
		metrics = new OpentelemetryMetrics("grid-service-2");
	}

	let hasRun = false;

	const networkConfig = getNetworkConfigFromEnv();
	gridState.node = new DRPNode(networkConfig ? { network_config: networkConfig } : undefined);
	await gridState.node.start();
	await gridState.node.networkNode.isDialable(async () => {
		console.log("Started node", import.meta.env);
		if (hasRun) return;
		hasRun = true;
		await run(metrics);
	});

	if (!hasRun) setInterval(renderInfo, import.meta.env.VITE_RENDER_INFO_INTERVAL);
}

void main();
