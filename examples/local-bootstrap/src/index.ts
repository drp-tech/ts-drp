import { DRPNode } from "@ts-drp/node";

const local_peer_id = "16Uiu2HAmTY71bbCHtmYD3nvVKUGbk7NWqLBbPFNng4jhaXJHi3W5";

if (!local_peer_id) {
	console.error(
		"Set local_peer_id in `/examples/local-bootstrap/src/index.ts` file with the peer id of the local bootstrap node"
	);
	process.exit(1);
}

let node: DRPNode;
let peers: string[] = [];

const render = (): void => {
	const element_peerId = <HTMLDivElement>document.getElementById("peerId");
	element_peerId.innerHTML = node.networkNode.peerId;

	const element_peers = <HTMLDivElement>document.getElementById("peers");
	element_peers.innerHTML = `[${peers.join(", ")}]`;
};

function initDRPNode(): void {
	if (node) {
		node.addCustomGroupMessageHandler("", () => {
			peers = node.networkNode.getAllPeers();
			render();
		});
	}
}

function main(): void {
	const select_address_type = <HTMLSelectElement>document.getElementById("bootstrap_node_host_address_type");
	const address_type_label = <HTMLSpanElement>document.getElementById("bootstrap_addr_type");
	const bootstrap_node_addr = <HTMLInputElement>document.getElementById("bootstrap_node_addr");

	// Default to IP4
	select_address_type.value = "ip4";
	address_type_label.innerText = "IP address";

	select_address_type?.addEventListener("change", () => {
		const val = select_address_type.value;
		if (val === "ip4") {
			address_type_label.innerText = "IP address";
			bootstrap_node_addr.placeholder = "0.0.0.0";
			bootstrap_node_addr.value = "127.0.0.1";
		} else if (val === "dns4") {
			address_type_label.innerText = "DNS address";
			bootstrap_node_addr.placeholder = "example.com";
			bootstrap_node_addr.value = "";
		}
	});

	const connect_form = <HTMLFormElement>document.getElementById("form_connect_to_bootstrap_node");
	const connect = async (): Promise<void> => {
		const bootstrap_node_port: HTMLInputElement = <HTMLInputElement>document.getElementById("bootstrap_node_port");
		const bootstrap_node_peer_id: HTMLInputElement = <HTMLInputElement>(
			document.getElementById("bootstrap_node_peer_id")
		);

		if (!bootstrap_node_addr.value || !bootstrap_node_port.value || !bootstrap_node_peer_id.value) {
			alert("Please fill in all the fields");
			return;
		}

		const is_ws: HTMLInputElement = <HTMLInputElement>document.getElementById("ws");

		const ws_protocl = is_ws.checked ? "ws" : "wss";
		const field_set = <HTMLFieldSetElement>document.getElementById("fieldset_connect_bootstrap_node");
		try {
			node = new DRPNode({
				network_config: {
					bootstrap_peers: [
						`/${select_address_type.value}/${bootstrap_node_addr.value}/tcp/${bootstrap_node_port.value}/${ws_protocl}/p2p/${bootstrap_node_peer_id.value}`,
					],
					bootstrap: false,
				},
			});

			await node.start();
			field_set.style.backgroundColor = "rgba(0, 255, 0, 0.2)";
			initDRPNode();
			render();
		} catch (_) {
			field_set.style.backgroundColor = "rgba(255, 0, 0, 0.2)";
			alert("Failed to connect to the bootstrap node");
			return;
		}
	};

	connect_form?.addEventListener("submit", (e) => {
		e.preventDefault();
		void connect();
	});

	render();

	// generic message handler
}

void main();
