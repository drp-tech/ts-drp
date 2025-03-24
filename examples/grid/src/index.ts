import { DRPNode } from "@ts-drp/node";
import { enableTracing, OpentelemetryMetrics } from "@ts-drp/tracer";
import { type DRPNodeConfig, type IMetrics } from "@ts-drp/types";

import { env } from "./env";
import { Grid } from "./objects/grid";
import { enableUIControls, render, renderInfo } from "./render";
import { gridState } from "./state";
import { getColorForPeerId } from "./util/color";

export function getNetworkConfigFromEnv(): DRPNodeConfig {
	const { bootstrapPeers, discoveryInterval, enablePrometheusMetrics } = env;

	const hasEnv = bootstrapPeers || discoveryInterval || enablePrometheusMetrics;

	const config: DRPNodeConfig = {
		network_config: {
			browser_metrics: true,
		},
	};

	if (!hasEnv) {
		return config;
	}

	if (bootstrapPeers) {
		config.network_config = {
			...config.network_config,
			bootstrap_peers: env.bootstrapPeers.split(","),
		};
	}

	if (discoveryInterval) {
		config.network_config = {
			...config.network_config,
			pubsub: {
				...config.network_config?.pubsub,
				peer_discovery_interval: env.discoveryInterval,
			},
		};
	}

	if (enablePrometheusMetrics) {
		config.network_config = {
			...config.network_config,
			pubsub: {
				...config.network_config?.pubsub,
				prometheus_metrics: true,
				pushgateway_url: window.location.origin,
			},
		};
	}

	return config;
}

function addUser(): void {
	const node = gridState.getNode();
	const gridDRP = gridState.getGridDRP();
	gridDRP.addUser(node.networkNode.peerId, getColorForPeerId(node.networkNode.peerId));
	render();
}

function moveUser(direction: string): void {
	const node = gridState.getNode();
	const gridDRP = gridState.getGridDRP();
	gridDRP.moveUser(node.networkNode.peerId, direction);
	render();
}

function createConnectHandlers(): void {
	const node = gridState.getNode();
	if (gridState.drpObject) {
		gridState.objectPeers = node.networkNode.getGroupPeers(gridState.drpObject.id);
	}

	const objectId = gridState.getObjectId();
	if (!objectId) return;

	node.messageQueueManager.subscribe(objectId, () => {
		if (!gridState.drpObject?.id) return;
		gridState.objectPeers = node.networkNode.getGroupPeers(gridState.drpObject?.id);
		render();
	});

	node.objectStore.subscribe(objectId, () => {
		render();
	});
}

function run(metrics?: IMetrics): void {
	enableUIControls();
	renderInfo();

	const button_create = <HTMLButtonElement>document.getElementById("createGrid");
	const create = async (): Promise<void> => {
		const node = gridState.getNode();

		gridState.drpObject = await node.createObject({
			drp: new Grid(),
			metrics,
		});
		gridState.gridDRP = gridState.drpObject.drp;
		createConnectHandlers();
		addUser();
		render();
	};

	button_create.addEventListener("click", () => void create());

	const button_connect = <HTMLButtonElement>document.getElementById("joinGrid");
	const grid_input = <HTMLInputElement>document.getElementById("gridInput");
	grid_input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			button_connect.click();
		}
	});

	const connect = async (): Promise<void> => {
		const drpId = grid_input.value;
		const node = gridState.getNode();

		try {
			gridState.drpObject = await node.connectObject({
				id: drpId,
				drp: new Grid(),
				metrics,
			});
			gridState.gridDRP = gridState.drpObject.drp;
			createConnectHandlers();
			addUser();
			render();
			console.log("Succeeded in connecting with DRP", drpId);
		} catch (e) {
			console.error("Error while connecting with DRP", drpId, e);
		}
	};

	button_connect.addEventListener("click", () => void connect());

	document.addEventListener("keydown", (event) => {
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

async function main(): Promise<void> {
	let metrics: IMetrics | undefined = undefined;
	if (env.enableTracing) {
		enableTracing();
		metrics = new OpentelemetryMetrics("grid-service-2");
	}

	let hasRun = false;

	const networkConfig = getNetworkConfigFromEnv();
	gridState.node = new DRPNode(networkConfig);
	await gridState.node.start();
	await gridState.node.networkNode.isDialable(() => {
		console.log("Started node", import.meta.env);
		if (hasRun) return;
		hasRun = true;
		run(metrics);
	});

	if (!hasRun) setInterval(renderInfo, import.meta.env.VITE_RENDER_INFO_INTERVAL);
}

void main();
