import { DRPNode } from "@ts-drp/node";
import type { DRPObject } from "@ts-drp/object";

import { Canvas } from "./objects/canvas";

const node = new DRPNode();
let drpObject: DRPObject;
let canvasDRP: Canvas;
let peers: string[] = [];
let discoveryPeers: string[] = [];
let objectPeers: string[] = [];

const render = (): void => {
	const peers_element = <HTMLDivElement>document.getElementById("peers");
	peers_element.innerHTML = `[${peers.join(", ")}]`;

	const discovery_element = <HTMLDivElement>document.getElementById("discovery_peers");
	discovery_element.innerHTML = `[${discoveryPeers.join(", ")}]`;

	const object_element = <HTMLDivElement>document.getElementById("object_peers");
	object_element.innerHTML = `[${objectPeers.join(", ")}]`;
	(<HTMLSpanElement>document.getElementById("canvasId")).innerText = drpObject?.id;

	if (!canvasDRP) return;
	const canvas = canvasDRP.canvas;
	for (let x = 0; x < canvas.length; x++) {
		for (let y = 0; y < canvas[x].length; y++) {
			const pixel = document.getElementById(`${x}-${y}`);
			if (!pixel) continue;
			pixel.style.backgroundColor = `rgb(${canvas[x][y].color()[0]}, ${canvas[x][y].color()[1]}, ${canvas[x][y].color()[2]})`;
		}
	}
};

const random_int = (max: number): number => Math.floor(Math.random() * max);

function paint_pixel(pixel: HTMLDivElement): void {
	const [x, y] = pixel.id.split("-").map((v) => Number.parseInt(v, 10));
	const painting: [number, number, number] = [random_int(256), random_int(256), random_int(256)];
	canvasDRP.paint([x, y], painting);
	const [r, g, b] = canvasDRP.query_pixel(x, y).color();
	pixel.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
}

function createConnectHandlers(): void {
	node.addCustomGroupMessageHandler(drpObject.id, () => {
		if (drpObject) objectPeers = node.networkNode.getGroupPeers(drpObject.id);
		render();
	});

	node.objectStore.subscribe(drpObject.id, () => {
		render();
	});
}

async function init(): Promise<void> {
	await node.start();
	render();

	const canvas_element = <HTMLDivElement>document.getElementById("canvas");
	canvas_element.innerHTML = "";
	canvas_element.style.display = "inline-grid";

	canvas_element.style.gridTemplateColumns = Array(5).fill("1fr").join(" ");
	for (let x = 0; x < 5; x++) {
		for (let y = 0; y < 10; y++) {
			const pixel = document.createElement("div");
			pixel.id = `${x}-${y}`;
			pixel.style.width = "25px";
			pixel.style.height = "25px";
			pixel.style.backgroundColor = "rgb(0, 0, 0)";
			pixel.style.cursor = "pointer";
			pixel.addEventListener("click", () => paint_pixel(pixel));
			canvas_element.appendChild(pixel);
		}
	}

	node.addCustomGroupMessageHandler("", () => {
		peers = node.networkNode.getAllPeers();
		discoveryPeers = node.networkNode.getGroupPeers("drp::discovery");
		render();
	});

	const create_button = <HTMLButtonElement>document.getElementById("create");
	const create = async (): Promise<void> => {
		drpObject = await node.createObject({ drp: new Canvas(5, 10) });
		canvasDRP = drpObject.drp as Canvas;

		createConnectHandlers();
		render();
	};

	create_button.addEventListener("click", () => void create());

	const canvasIdInput = <HTMLInputElement>document.getElementById("canvasIdInput");
	const connect = async (): Promise<void> => {
		const drpId = canvasIdInput.value;
		try {
			drpObject = await node.createObject({
				id: drpId,
				drp: new Canvas(5, 10),
			});
			canvasDRP = drpObject.drp as Canvas;

			createConnectHandlers();
			render();
		} catch (e) {
			console.error("Error while connecting with DRP", drpId, e);
		}
	};

	const connect_button = <HTMLButtonElement>document.getElementById("connect");
	connect_button.addEventListener("click", () => void connect());
}

void init();
