import { DRPNode } from "@ts-drp/node";
import type { DRPObject } from "@ts-drp/object";

import { Chat } from "./objects/chat";

const node = new DRPNode();
let drpObject: DRPObject;
let chatDRP: Chat;
let peers: string[] = [];
let discoveryPeers: string[] = [];
let objectPeers: string[] = [];

const render = (): void => {
	if (drpObject) (<HTMLButtonElement>document.getElementById("chatId")).innerText = drpObject.id;
	const element_peerId = <HTMLDivElement>document.getElementById("peerId");
	element_peerId.innerHTML = node.networkNode.peerId;

	const element_peers = <HTMLDivElement>document.getElementById("peers");
	element_peers.innerHTML = `[${peers.join(", ")}]`;

	const element_discoveryPeers = <HTMLDivElement>document.getElementById("discoveryPeers");
	element_discoveryPeers.innerHTML = `[${discoveryPeers.join(", ")}]`;

	const element_objectPeers = <HTMLDivElement>document.getElementById("objectPeers");
	element_objectPeers.innerHTML = `[${objectPeers.join(", ")}]`;

	if (!chatDRP) return;
	const chat = chatDRP.query_messages();
	const element_chat = <HTMLDivElement>document.getElementById("chat");
	element_chat.innerHTML = "";

	if (chat.size === 0) {
		const div = document.createElement("div");
		div.innerHTML = "No messages yet";
		div.style.padding = "10px";
		element_chat.appendChild(div);
		return;
	}
	for (const message of [...chat].sort()) {
		const div = document.createElement("div");
		div.innerHTML = message;
		div.style.padding = "10px";
		element_chat.appendChild(div);
	}
};

function sendMessage(message: string): void {
	const timestamp: string = Date.now().toString();
	if (!chatDRP) {
		console.error("Chat DRP not initialized");
		alert("Please create or join a chat room first");
		return;
	}

	chatDRP.addMessage(timestamp, message, node.networkNode.peerId);
	render();
}

function createConnectHandlers(): void {
	node.addCustomGroupMessageHandler(drpObject.id, () => {
		// on create/connect
		if (drpObject) objectPeers = node.networkNode.getGroupPeers(drpObject.id);
		render();
	});

	node.objectStore.subscribe(drpObject.id, () => {
		render();
	});
}

async function main(): Promise<void> {
	await node.start();
	render();

	// generic message handler
	node.addCustomGroupMessageHandler("", () => {
		peers = node.networkNode.getAllPeers();
		discoveryPeers = node.networkNode.getGroupPeers("drp::discovery");
		render();
	});

	const button_create = <HTMLButtonElement>document.getElementById("createRoom");
	const button_connect = <HTMLButtonElement>document.getElementById("joinRoom");
	const input: HTMLInputElement = <HTMLInputElement>document.getElementById("roomInput");

	const create = async (): Promise<void> => {
		drpObject = await node.createObject({ drp: new Chat() });
		chatDRP = drpObject.drp as Chat;
		createConnectHandlers();
		render();
	};

	button_create.addEventListener("click", () => void create());

	const connect = async (): Promise<void> => {
		const objectId = input.value;
		if (!objectId) {
			alert("Please enter a room id");
			return;
		}

		drpObject = await node.createObject({ id: objectId, drp: new Chat() });
		chatDRP = drpObject.drp as Chat;
		createConnectHandlers();
		render();
	};

	button_connect.addEventListener("click", () => void connect());

	const button_send = <HTMLButtonElement>document.getElementById("sendMessage");
	button_send.addEventListener("click", () => {
		const input: HTMLInputElement = <HTMLInputElement>document.getElementById("messageInput");
		const message: string = input.value;
		input.value = "";
		if (!message) {
			console.error("Tried sending an empty message");
			alert("Please enter a message");
			return;
		}
		sendMessage(message);
		const element_chat = <HTMLDivElement>document.getElementById("chat");
		element_chat.scrollTop = element_chat.scrollHeight;
	});
}

void main();
