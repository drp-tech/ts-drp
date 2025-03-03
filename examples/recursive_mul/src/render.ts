import { recursiveMulState } from "./state";
import { getColorForPeerId } from "./util/color";

const formatPeerId = (id: string): string => {
	return `${id.slice(0, 4)}...${id.slice(-4)}`;
};

export function renderInfo() {
	renderPeerId();
	renderPeers();
	renderDiscoveryPeers();
	renderPeersInDRP();
}

function renderClickablePeerList(
	peers: string[],
	isOpen: boolean,
	elementId: string,
	callback: () => void,
	defaultText = "[]"
) {
	const element = <HTMLDivElement>document.getElementById(elementId);
	const hasPeers = peers.length > 0;
	if (!hasPeers) {
		element.innerHTML = defaultText;
		return;
	}

	element.innerHTML = `[${peers.map((peer) => `<strong style="color: ${getColorForPeerId(peer)};">${formatPeerId(peer)}</strong>`).join(", ")}]`;
	element.style.cursor = "pointer";

	const peersList = document.createElement("ul");
	peersList.style.display = "none";
	peersList.style.margin = "10px 0";
	peersList.style.paddingLeft = "20px";

	for (const peer of peers) {
		const li = document.createElement("li");
		li.innerHTML = `<strong style="color: ${getColorForPeerId(peer)};">${peer}</strong>`;
		peersList.appendChild(li);
	}

	element.appendChild(peersList);

	peersList.style.display = isOpen ? "block" : "none";
	element.onclick = () => {
		peersList.style.display = peersList.style.display === "none" ? "block" : "none";
		callback();
	};
}

let isDiscoveryPeersOpen = false;

const renderDiscoveryPeers = () => {
	recursiveMulState.discoveryPeers =
		recursiveMulState.node.networkNode.getGroupPeers("drp::discovery");

	renderClickablePeerList(
		recursiveMulState.discoveryPeers,
		isDiscoveryPeersOpen,
		"discoveryPeers",
		() => {
			isDiscoveryPeersOpen = !isDiscoveryPeersOpen;
		}
	);
};

let isPeersOpen = false;

const renderPeers = () => {
	recursiveMulState.peers = recursiveMulState.node.networkNode.getAllPeers();

	renderClickablePeerList(recursiveMulState.peers, isPeersOpen, "peers", () => {
		isPeersOpen = !isPeersOpen;
	});
};

let isPeersInDRPOpen = false;

const renderPeersInDRP = () => {
	if (recursiveMulState.drpObject)
		recursiveMulState.objectPeers = recursiveMulState.node.networkNode.getGroupPeers(
			recursiveMulState.drpObject.id
		);

	renderClickablePeerList(
		recursiveMulState.objectPeers,
		isPeersInDRPOpen,
		"objectPeers",
		() => {
			isPeersInDRPOpen = !isPeersInDRPOpen;
		},
		"Your frens in RECURSIVE MUL: []"
	);
};

let isPeerIdExpanded = false;

const renderPeerId = () => {
	const element_peerId = <HTMLDivElement>document.getElementById("peerId");

	const innerHtml = () => `
	<strong id="peerIdExpanded" 
			style="color: ${getColorForPeerId(recursiveMulState.node.networkNode.peerId)};
				   ${isPeerIdExpanded ? "" : "display: none;"}">
	  ${recursiveMulState.node.networkNode.peerId}
	</strong>
	<strong id="peerIdCollapsed" 
			style="color: ${getColorForPeerId(recursiveMulState.node.networkNode.peerId)};
				   ${!isPeerIdExpanded ? "" : "display: none;"}">
	  ${formatPeerId(recursiveMulState.node.networkNode.peerId)}
	</strong>`;

	element_peerId.style.cursor = "pointer";
	element_peerId.innerHTML = innerHtml();
	element_peerId.onclick = () => {
		isPeerIdExpanded = !isPeerIdExpanded;
		element_peerId.innerHTML = innerHtml();
	};
};

export const render = () => {
	if (recursiveMulState.drpObject) {
		const mulIdTextElement = <HTMLSpanElement>document.getElementById("mulIdText");
		mulIdTextElement.innerText = `You're in RECURSIVE MUL ID:`;
		const mulIdElement = <HTMLSpanElement>document.getElementById("mulId");
		mulIdElement.innerText = recursiveMulState.drpObject.id;
		const copyMulIdButton = document.getElementById("copyMulId");
		if (copyMulIdButton) {
			copyMulIdButton.style.display = "inline"; // Show the button
		}
	} else {
		const copyMulIdButton = document.getElementById("copyMulId");
		if (copyMulIdButton) {
			copyMulIdButton.style.display = "none"; // Hide the button
		}
	}

	if (!recursiveMulState.drpObject) return;

	// Update current value
	const currentValueElement = <HTMLSpanElement>document.getElementById("currentValue");
	if (currentValueElement && recursiveMulState.recursiveMulDRP) {
		currentValueElement.innerText = recursiveMulState.recursiveMulDRP.query_value().toString();
	}

	// Update history list
	const historyListElement = <HTMLUListElement>document.getElementById("historyList");
	if (historyListElement && recursiveMulState.recursiveMulDRP) {
		const history = recursiveMulState.recursiveMulDRP.query_history();
		historyListElement.innerHTML =
			history.length > 0
				? history.map((value) => `<li>Added ${value} (running total)</li>`).join("")
				: "<li>No operations yet</li>";
	}
};

export function enableUIControls() {
	const loadingMessage = document.getElementById("loadingMessage");
	if (loadingMessage) {
		loadingMessage.style.display = "none";
	}

	const joinButton = <HTMLButtonElement>document.getElementById("joinMul");
	const createButton = <HTMLButtonElement>document.getElementById("createMul");
	const mulInput = <HTMLInputElement>document.getElementById("mulInput");
	const copyButton = <HTMLButtonElement>document.getElementById("copyMulId");

	joinButton.disabled = false;
	createButton.disabled = false;
	mulInput.disabled = false;
	copyButton.disabled = false;
}
