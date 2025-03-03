import { RecursiveMulDRP } from "@ts-drp/blueprints";
import { DRPNode, DRPNodeConfig } from "@ts-drp/node";
import { enableTracing, IMetrics, OpentelemetryMetrics } from "@ts-drp/tracer";

import { env } from "./env";
import { render, enableUIControls, renderInfo } from "./render";
import { recursiveMulState } from "./state";

export function getNetworkConfigFromEnv(): DRPNodeConfig {
	const hasBootstrapPeers = env.bootstrapPeers;
	const hasDiscoveryInterval = env.discoveryInterval;

	const hasEnv = hasBootstrapPeers || hasDiscoveryInterval;

	const config: DRPNodeConfig = {
		network_config: {
			browser_metrics: true,
		},
	};

	if (!hasEnv) {
		config.network_config = {
			...config.network_config,
			bootstrap_peers: [
				"/ip4/127.0.0.1/tcp/50000/ws/p2p/12D3KooWC6sm9iwmYbeQJCJipKTRghmABNz1wnpJANvSMabvecwJ",
			],
			browser_metrics: true,
		};
		return config;
	}

	if (hasBootstrapPeers) {
		config.network_config = {
			...config.network_config,
			bootstrap_peers: env.bootstrapPeers.split(","),
		};
	}

	if (hasDiscoveryInterval) {
		config.network_config = {
			...config.network_config,
			pubsub: {
				...config.network_config?.pubsub,
				peer_discovery_interval: env.discoveryInterval,
			},
		};
	}

	return config;
}

function makeMultiplication(value: number) {
	if (!recursiveMulState.recursiveMulDRP) {
		console.error("Recursive Mul DRP not initialized");
		alert("Please create or join a recursive mul first");
		return;
	}

	console.log("Making multiplication", value);
	recursiveMulState.recursiveMulDRP.recursive_mul(value);
	render();
}

async function createConnectHandlers() {
	if (recursiveMulState.drpObject)
		recursiveMulState.objectPeers = recursiveMulState.node.networkNode.getGroupPeers(
			recursiveMulState.drpObject.id
		);

	if (!recursiveMulState.drpObject?.id) return;

	recursiveMulState.node.addCustomGroupMessageHandler(recursiveMulState.drpObject?.id, () => {
		if (!recursiveMulState.drpObject?.id) return;
		recursiveMulState.objectPeers = recursiveMulState.node.networkNode.getGroupPeers(
			recursiveMulState.drpObject?.id
		);
		console.log("Received object update");
		render();
	});

	recursiveMulState.node.objectStore.subscribe(recursiveMulState.drpObject?.id, () => {
		console.log("Received object update");
		render();
	});
}

async function run(metrics?: IMetrics) {
	enableUIControls();
	renderInfo();

	const button_create = <HTMLButtonElement>document.getElementById("createMul");
	button_create.addEventListener("click", async () => {
		recursiveMulState.drpObject = await recursiveMulState.node.createObject({
			drp: new RecursiveMulDRP({ withHistory: true }),
			metrics,
		});
		recursiveMulState.recursiveMulDRP = recursiveMulState.drpObject.drp as RecursiveMulDRP;
		await createConnectHandlers();
		render();
	});

	const button_connect = <HTMLButtonElement>document.getElementById("joinMul");
	const mul_input = <HTMLInputElement>document.getElementById("mulInput");
	mul_input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			button_connect.click();
		}
	});
	button_connect.addEventListener("click", async () => {
		const drpId = mul_input.value;
		try {
			recursiveMulState.drpObject = await recursiveMulState.node.connectObject({
				id: drpId,
				drp: new RecursiveMulDRP({ withHistory: true }),
				metrics,
			});
			recursiveMulState.recursiveMulDRP = recursiveMulState.drpObject.drp as RecursiveMulDRP;
			await createConnectHandlers();
			render();
			console.log("Succeeded in connecting with DRP", drpId);
		} catch (e) {
			console.error("Error while connecting with DRP", drpId, e);
		}
	});

	const copyButton = <HTMLButtonElement>document.getElementById("copyMulId");
	copyButton.addEventListener("click", () => {
		const mulIdText = (<HTMLSpanElement>document.getElementById("mulId")).innerText;
		navigator.clipboard
			.writeText(mulIdText)
			.then(() => {
				console.log("Recursive Mul DRP ID copied to clipboard");
			})
			.catch((err) => {
				console.error("Failed to copy: ", err);
			});
	});

	const button_multiply = <HTMLButtonElement>document.getElementById("multiplyButton");
	button_multiply.addEventListener("click", () => {
		const value = parseInt((<HTMLInputElement>document.getElementById("numberInput")).value);
		makeMultiplication(value);
	});
}

async function main() {
	let metrics: IMetrics | undefined = undefined;
	if (env.enableTracing) {
		enableTracing();
		metrics = new OpentelemetryMetrics("recursive-mul-service-2");
	}

	let hasRun = false;

	const networkConfig = getNetworkConfigFromEnv();
	recursiveMulState.node = new DRPNode(networkConfig);
	await recursiveMulState.node.start();
	await recursiveMulState.node.networkNode.isDialable(async () => {
		console.log("Started node", import.meta.env);
		if (hasRun) return;
		hasRun = true;
		await run(metrics);
	});

	if (!hasRun) setInterval(renderInfo, import.meta.env.VITE_RENDER_INFO_INTERVAL);
}

void main();
