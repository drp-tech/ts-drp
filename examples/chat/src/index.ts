import { DRPNode } from "@ts-drp/node";
import type { IDRPObject } from "@ts-drp/types";
import { DRP_DISCOVERY_TOPIC } from "@ts-drp/types";

import { Chat } from "./objects/chat";
import { setupCopyButton } from "./util/clipboard";
import { createPeerNameElement, formatPeerItem, shortenId, styleMessageElement } from "./util/peerIdentity";
import { initializeToastContainer, showToast, ToastType } from "./util/toast";

// Helper function to set up collapsible sections
function setupCollapsibleSections(): void {
	const infoToggle = document.getElementById("infoToggle");
	const infoContainer = document.querySelector(".info-container");

	if (infoToggle && infoContainer) {
		const toggleText = infoToggle.querySelector(".toggle-text");

		infoToggle.addEventListener("click", () => {
			infoContainer.classList.toggle("expanded");

			// Update toggle button text
			if (toggleText instanceof HTMLElement) {
				if (infoContainer.classList.contains("expanded")) {
					toggleText.textContent = "Hide Connection Info";
				} else {
					toggleText.textContent = "Show Connection Info";
				}
			}
		});

		// Check if we need to initialize the expanded state based on screen size
		const updateExpandedState = (): void => {
			if (window.innerWidth > 767) {
				infoContainer.classList.add("expanded");
			} else {
				infoContainer.classList.remove("expanded");
			}
		};

		// Run initially and on resize
		updateExpandedState();
		window.addEventListener("resize", updateExpandedState);
	}
}

class ChatStateManager {
	_node: DRPNode;
	_drpObject: IDRPObject<Chat> | undefined = undefined;

	constructor() {
		this._node = new DRPNode();
	}

	hasChat(): boolean {
		try {
			if (!this.chat) {
				return false;
			}
			return true;
		} catch {
			return false;
		}
	}

	get chat(): Chat {
		if (!this.drp.drp) {
			throw new Error("Chat DRP not initialized");
		}
		return this.drp.drp;
	}

	get drp(): IDRPObject<Chat> {
		if (!this._drpObject) {
			throw new Error("DRP object not initialized");
		}
		return this._drpObject;
	}

	get node(): DRPNode {
		return this._node;
	}

	get peers(): string[] {
		return this._node.networkNode.getAllPeers();
	}

	get discoveryPeers(): string[] {
		return this._node.networkNode.getGroupPeers(DRP_DISCOVERY_TOPIC);
	}

	get objectPeers(): string[] {
		if (!this._drpObject) return [];
		try {
			return this._node.networkNode.getGroupPeers(this.drp.id);
		} catch (e) {
			console.warn(e);
			return [];
		}
	}
}

const element_peers = <HTMLDivElement>document.getElementById("peers");
const element_discoveryPeers = <HTMLDivElement>document.getElementById("discoveryPeers");
const element_objectPeers = <HTMLDivElement>document.getElementById("objectPeers");
const element_peerId = <HTMLDivElement>document.getElementById("peerId");
const element_chatId = <HTMLDivElement>document.getElementById("chatId");
const element_chat = <HTMLDivElement>document.getElementById("chat");

const renderPeers = (chatState: ChatStateManager): void => {
	element_peers.innerHTML = "";
	chatState.peers.forEach((peerId) => {
		element_peers.appendChild(formatPeerItem(peerId));
	});
};

const renderDiscoveryPeers = (chatState: ChatStateManager): void => {
	element_discoveryPeers.innerHTML = "";
	chatState.discoveryPeers.forEach((peerId) => {
		element_discoveryPeers.appendChild(formatPeerItem(peerId));
	});
};

const renderObjectPeers = (chatState: ChatStateManager): void => {
	element_objectPeers.innerHTML = "";
	chatState.objectPeers.forEach((peerId) => {
		element_objectPeers.appendChild(formatPeerItem(peerId));
	});
};

const renderPeerId = (chatState: ChatStateManager): void => {
	element_peerId.innerHTML = "";
	element_peerId.appendChild(formatPeerItem(chatState.node.networkNode.peerId));
};

const renderChatId = (chatState: ChatStateManager): void => {
	if (!chatState.drp) return;
	const shortenedId = shortenId(chatState.drp.id);
	element_chatId.innerHTML = `<span>${shortenedId}</span>`;
	element_chatId.setAttribute("data-full-id", chatState.drp.id);
};

const renderChat = (chatState: ChatStateManager): void => {
	const chat = chatState.chat.query_messages();
	element_chat.innerHTML = "";

	if (chat.size === 0) {
		const div = document.createElement("div");
		div.innerHTML = "No messages yet";
		div.className = "no-messages";
		div.style.padding = "10px";
		div.style.textAlign = "center";
		div.style.color = "#6c757d";
		element_chat.appendChild(div);
		return;
	}

	// Get current user's peer ID
	const currentPeerId = chatState.node.networkNode.peerId;

	// Parse and sort messages by timestamp
	const parsedMessages = [...chat]
		.map((message) => {
			const match = message.match(/^\(([^,]+), (.*), ([^)]+)\)$/);
			if (match) {
				const [_, timestamp, content, peerId] = match;
				return {
					original: message,
					timestamp: parseInt(timestamp),
					content,
					peerId,
					isSelf: peerId === currentPeerId,
				};
			}
			return {
				original: message,
				timestamp: 0,
				content: message,
				peerId: "unknown",
				isSelf: false,
			};
		})
		.sort((a, b) => a.timestamp - b.timestamp);

	for (const parsedMessage of parsedMessages) {
		const messageDiv = document.createElement("div");
		messageDiv.className = `message ${parsedMessage.isSelf ? "self" : ""}`;

		if (parsedMessage.timestamp > 0) {
			// Format timestamp
			const date = new Date(parsedMessage.timestamp);
			const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

			// Create timestamp element
			const timestampDiv = document.createElement("div");
			timestampDiv.className = "message-timestamp";
			timestampDiv.textContent = formattedDate;

			// Create sender element
			const senderDiv = document.createElement("div");
			senderDiv.className = "message-sender";
			senderDiv.appendChild(createPeerNameElement(parsedMessage.peerId));

			// Create content element
			const contentDiv = document.createElement("div");
			contentDiv.className = "message-content";
			contentDiv.textContent = parsedMessage.content;

			// Append all elements to message div
			messageDiv.appendChild(timestampDiv);
			messageDiv.appendChild(senderDiv);
			messageDiv.appendChild(contentDiv);

			// Style the message with the peer's color
			styleMessageElement(messageDiv, parsedMessage.peerId);
		} else {
			// Fallback if message format doesn't match
			messageDiv.textContent = parsedMessage.original;
		}

		element_chat.appendChild(messageDiv);
	}

	// Auto-scroll to bottom
	element_chat.scrollTop = element_chat.scrollHeight;
};

const render = (chatState: ChatStateManager): void => {
	renderPeers(chatState);
	renderDiscoveryPeers(chatState);
	renderObjectPeers(chatState);
	renderPeerId(chatState);
	if (!chatState.hasChat()) return;
	renderChatId(chatState);
	renderChat(chatState);
};

function sendMessage(message: string, chatState: ChatStateManager): void {
	const timestamp: string = Date.now().toString();
	if (!chatState.drp.drp) {
		showToast("Please create or join a chat room first", ToastType.ERROR, 5000);
		return;
	}

	try {
		chatState.chat.addMessage(timestamp, message, chatState.node.networkNode.peerId);
		render(chatState);
	} catch (error) {
		showToast(error instanceof Error ? error.message : "Failed to send message", ToastType.ERROR, 5000);
	}
}

function createConnectHandlers(chatState: ChatStateManager): void {
	const node = chatState.node;
	node.messageQueueManager.subscribe(chatState.drp.id, () => {
		// on create/connect
		renderChat(chatState);
	});

	node.subscribe(chatState.drp.id, () => {
		renderChat(chatState);
	});
}

const button_create = <HTMLButtonElement>document.getElementById("createRoom");
const button_connect = <HTMLButtonElement>document.getElementById("joinRoom");
const button_send = <HTMLButtonElement>document.getElementById("sendMessage");
const room_input: HTMLInputElement = <HTMLInputElement>document.getElementById("roomInput");
const message_input: HTMLInputElement = <HTMLInputElement>document.getElementById("messageInput");

async function main(): Promise<void> {
	const chatState = new ChatStateManager();
	await chatState.node.start();
	initializeToastContainer();
	setupCopyButton();
	setupCollapsibleSections(); // Initialize collapsible sections

	// 1st render
	render(chatState);

	chatState.node.messageQueueManager.subscribe(DRP_DISCOVERY_TOPIC, () => {
		render(chatState);
	});

	const create = async (): Promise<void> => {
		chatState._drpObject = await chatState.node.createObject({ drp: new Chat() });
		createConnectHandlers(chatState);

		// The object creator can sign for finality
		if (chatState.node?.keychain.blsPublicKey) {
			chatState.drp.acl.setKey(chatState.node?.keychain.blsPublicKey);
		}
		render(chatState);
	};

	const connect = async (): Promise<void> => {
		const objectId = room_input.value;
		if (!objectId) {
			showToast("Please enter a room ID", ToastType.ERROR, 5000);
			return;
		}

		try {
			chatState._drpObject = await chatState.node.connectObject({ id: objectId, drp: new Chat() });
			createConnectHandlers(chatState);
			render(chatState);
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Failed to connect to room", ToastType.ERROR, 5000);
		}
	};

	const sendMessageListener = (): void => {
		const message: string = message_input.value;
		message_input.value = "";
		if (!message) {
			showToast("Please enter a message", ToastType.ERROR, 5000);
			return;
		}

		try {
			sendMessage(message, chatState);
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Failed to send message", ToastType.ERROR, 5000);
		}
	};

	button_create.addEventListener("click", () => {
		if (room_input.value) {
			void connect();
		} else {
			void create();
		}
		room_input.value = "";
	});
	button_connect.addEventListener("click", () => void connect());
	button_send.addEventListener("click", () => void sendMessageListener());

	// periodically render the peers
	setInterval(() => {
		renderPeers(chatState);
		renderDiscoveryPeers(chatState);
		renderObjectPeers(chatState);
		if (!chatState.hasChat()) return;
		renderChatId(chatState);
	}, 3000);

	setInterval(() => {
		if (!chatState.hasChat()) return;
		render(chatState);
	}, 10_000);
}

void main();
