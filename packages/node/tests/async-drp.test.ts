import { type Connection, type IdentifyResult, type Libp2p } from "@libp2p/interface";
import { DRPNetworkNode } from "@ts-drp/network";
import {
	ActionType,
	type DRPNodeConfig,
	type IDRP,
	type ResolveConflictsType,
	SemanticsType,
} from "@ts-drp/types";
import { raceEvent } from "race-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { DRPNode } from "../src/index.js";

export class AsyncCounterDRP implements IDRP {
	semanticsType = SemanticsType.pair;

	private _value: number;

	constructor(initialValue?: number) {
		this._value = initialValue ?? 0;
	}

	async increment(): Promise<number> {
		await Promise.resolve();
		this._value++;
		return this._value;
	}

	async decrement(): Promise<number> {
		await Promise.resolve();
		this._value--;
		return this._value;
	}

	query_value(): number {
		return this._value;
	}

	resolveConflicts(): ResolveConflictsType {
		return { action: ActionType.Nop };
	}
}

describe("Async DRP", () => {
	let node1: DRPNode;
	let node2: DRPNode;
	let btNode: DRPNetworkNode;

	beforeEach(async () => {
		btNode = new DRPNetworkNode({
			bootstrap: true,
			listen_addresses: ["/ip4/0.0.0.0/tcp/0/ws"],
			bootstrap_peers: [],
			log_config: {
				level: "silent",
			},
		});
		await btNode.start();

		const bootstrapMultiaddrs = btNode.getMultiaddrs();

		const config: DRPNodeConfig = {
			network_config: {
				bootstrap_peers: bootstrapMultiaddrs,
				log_config: {
					level: "silent",
				},
			},
		};

		node1 = new DRPNode(config);
		node2 = new DRPNode(config);
		await node1.start();
		await node2.start();

		const btNodeLibp2p = btNode["_node"] as Libp2p;

		const getFilter =
			(peerId: string) =>
			(event: CustomEvent<IdentifyResult>): boolean =>
				event.detail.peerId.equals(peerId) && event.detail.listenAddrs.length > 0;

		console.log(
			"waiting for peers to identify",
			node1.networkNode.peerId,
			node2.networkNode.peerId
		);
		await Promise.all([
			raceEvent(btNodeLibp2p, "peer:identify", undefined, {
				filter: getFilter(node2.networkNode.peerId),
			}),
			raceEvent(btNodeLibp2p, "peer:identify", undefined, {
				filter: getFilter(node1.networkNode.peerId),
			}),
		]);

		console.log("peers identified", node1.networkNode.peerId, node2.networkNode.peerId);

		await Promise.all([
			node1.networkNode.connect(node2.networkNode["_node"]?.getMultiaddrs()),
			raceEvent(node1.networkNode["_node"] as Libp2p, "connection:open", undefined, {
				filter: (event: CustomEvent<Connection>) =>
					event.detail.remotePeer.toString() === node2.networkNode.peerId &&
					event.detail.limits === undefined,
			}),
		]);
		console.log("connected", node1.networkNode.peerId, node2.networkNode.peerId);
	});

	afterEach(async () => {
		await Promise.all([node1.stop(), node2.stop(), btNode.stop()]);
	});

	test("async drp", async () => {
		console.log("creating object", node1.networkNode.peerId, node2.networkNode.peerId);
		const drpObjectNode1 = await node1.createObject({
			drp: new AsyncCounterDRP(),
		});

		const drpObjectNode2 = await node2.connectObject({
			drp: new AsyncCounterDRP(),
			id: drpObjectNode1.id,
		});

		const drp1 = drpObjectNode1.drp as AsyncCounterDRP;
		const drp2 = drpObjectNode2.drp as AsyncCounterDRP;

		const value1 = await drp1.increment();
		await new Promise((resolve) => setTimeout(resolve, 2000));
		expect(drp2.query_value()).toEqual(1);
		expect(value1).toEqual(1);

		await drp1.increment();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		expect(drp2.query_value()).toEqual(2);
	});
});
