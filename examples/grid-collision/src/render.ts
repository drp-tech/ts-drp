import { gridState } from "./state";
import { getColorForPeerId, hexToRgba } from "./util/color";

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
	gridState.discoveryPeers = gridState.node.networkNode.getGroupPeers("drp::discovery");

	renderClickablePeerList(gridState.discoveryPeers, isDiscoveryPeersOpen, "discoveryPeers", () => {
		isDiscoveryPeersOpen = !isDiscoveryPeersOpen;
	});
};

let isPeersOpen = false;

const renderPeers = () => {
	gridState.peers = gridState.node.networkNode.getAllPeers();

	renderClickablePeerList(gridState.peers, isPeersOpen, "peers", () => {
		isPeersOpen = !isPeersOpen;
	});
};

let isPeersInDRPOpen = false;

const renderPeersInDRP = () => {
	if (gridState.drpObject)
		gridState.objectPeers = gridState.node.networkNode.getGroupPeers(gridState.drpObject.id);

	renderClickablePeerList(
		gridState.objectPeers,
		isPeersInDRPOpen,
		"objectPeers",
		() => {
			isPeersInDRPOpen = !isPeersInDRPOpen;
		},
		"Your frens in GRID: []"
	);
};

let isPeerIdExpanded = false;

const renderPeerId = () => {
	const element_peerId = <HTMLDivElement>document.getElementById("peerId");

	const innerHtml = () => `
	<strong id="peerIdExpanded" 
			style="color: ${getColorForPeerId(gridState.node.networkNode.peerId)};
				   ${isPeerIdExpanded ? "" : "display: none;"}">
	  ${gridState.node.networkNode.peerId}
	</strong>
	<strong id="peerIdCollapsed" 
			style="color: ${getColorForPeerId(gridState.node.networkNode.peerId)};
				   ${!isPeerIdExpanded ? "" : "display: none;"}">
	  ${formatPeerId(gridState.node.networkNode.peerId)}
	</strong>`;

	element_peerId.style.cursor = "pointer";
	element_peerId.innerHTML = innerHtml();
	element_peerId.onclick = () => {
		isPeerIdExpanded = !isPeerIdExpanded;
		element_peerId.innerHTML = innerHtml();
	};
};

export const render = () => {
	if (gridState.drpObject) {
		const gridIdTextElement = <HTMLSpanElement>document.getElementById("gridIdText");
		gridIdTextElement.innerText = `You're in GRID ID:`;
		const gridIdElement = <HTMLSpanElement>document.getElementById("gridId");
		gridIdElement.innerText = gridState.drpObject.id;
		const copyGridIdButton = document.getElementById("copyGridId");
		if (copyGridIdButton) {
			copyGridIdButton.style.display = "inline"; // Show the button
		}
	} else {
		const copyGridIdButton = document.getElementById("copyGridId");
		if (copyGridIdButton) {
			copyGridIdButton.style.display = "none"; // Hide the button
		}
	}

	if (!gridState.drpObject) return;
	const users = gridState.gridDRP?.query_users();
	const element_grid = <HTMLDivElement>document.getElementById("grid");
	element_grid.innerHTML = "";

	const gridWidth = element_grid.clientWidth;
	const gridHeight = element_grid.clientHeight;
	const centerX = Math.floor(gridWidth / 2);
	const centerY = Math.floor(gridHeight / 2);

	// Draw grid lines
	const numLinesX = Math.floor(gridWidth / 50);
	const numLinesY = Math.floor(gridHeight / 50);

	for (let i = -numLinesX; i <= numLinesX; i++) {
		const line = document.createElement("div");
		line.style.position = "absolute";
		line.style.left = `${centerX + i * 50}px`;
		line.style.top = "0";
		line.style.width = "1px";
		line.style.height = "100%";
		line.style.backgroundColor = "lightgray";
		element_grid.appendChild(line);
	}

	for (let i = -numLinesY; i <= numLinesY; i++) {
		const line = document.createElement("div");
		line.style.position = "absolute";
		line.style.left = "0";
		line.style.top = `${centerY + i * 50}px`;
		line.style.width = "100%";
		line.style.height = "1px";
		line.style.backgroundColor = "lightgray";
		element_grid.appendChild(line);
	}

	if (!users) return;
	for (const userColorString of users) {
		const [id, color] = userColorString.split(":");
		const position = gridState.gridDRP?.query_userPosition(userColorString);

		if (position) {
			const div = document.createElement("div");
			div.style.position = "absolute";
			div.style.left = `${centerX + position.x * 50 + 5}px`; // Center the circle
			div.style.top = `${centerY - position.y * 50 + 5}px`; // Center the circle
			if (id === gridState.node.networkNode.peerId) {
				div.style.width = `${34}px`;
				div.style.height = `${34}px`;
			} else {
				div.style.width = `${34 + 6}px`;
				div.style.height = `${34 + 6}px`;
			}
			div.style.backgroundColor = color;
			div.style.borderRadius = "50%";
			div.style.transition = "background-color 1s ease-in-out";
			div.style.animation = `glow-${id} 0.5s infinite alternate`;

			// Add black border for the current user's circle
			if (id === gridState.node.networkNode.peerId) {
				div.style.border = "3px solid black";
			}

			div.setAttribute("data-glowing-peer-id", id);

			// Create dynamic keyframes for the glow effect
			const style = document.createElement("style");
			style.innerHTML = `
			@keyframes glow-${id} {
				0% {
					background-color: ${hexToRgba(color, 0.5)};
				}
				100% {
					background-color: ${hexToRgba(color, 1)};
				}
			}`;
			document.head.appendChild(style);

			element_grid.appendChild(div);
		}
	}
};

export function enableUIControls() {
	const loadingMessage = document.getElementById("loadingMessage");
	if (loadingMessage) {
		loadingMessage.style.display = "none";
	}

	const joinButton = <HTMLButtonElement>document.getElementById("joinGrid");
	const createButton = <HTMLButtonElement>document.getElementById("createGrid");
	const gridInput = <HTMLInputElement>document.getElementById("gridInput");
	const copyButton = <HTMLButtonElement>document.getElementById("copyGridId");

	joinButton.disabled = false;
	createButton.disabled = false;
	gridInput.disabled = false;
	copyButton.disabled = false;
}
