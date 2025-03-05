import { type GossipsubMessage } from "@chainsafe/libp2p-gossipsub";
import { type DRP, DRPObject, HashGraph } from "@ts-drp/object";
import { type IMetrics } from "@ts-drp/tracer";
import { FetchState, Message, MessageType, Sync } from "@ts-drp/types";

import { drpMessagesHandler, drpObjectChangesHandler } from "./handlers.js";
import { type DRPNode } from "./index.js";
import { log } from "./logger.js";

export function createObject(node: DRPNode, object: DRPObject) {
	node.objectStore.put(object.id, object);
	object.subscribe((obj, originFn, vertices) => {
		drpObjectChangesHandler(node, obj, originFn, vertices);
	});
}

export type ConnectObjectOptions = {
	drp?: DRP;
	peerId?: string;
	metrics?: IMetrics;
};

export async function connectObject(
	node: DRPNode,
	id: string,
	options: ConnectObjectOptions
): Promise<DRPObject> {
	const object = DRPObject.createObject({
		peerId: node.networkNode.peerId,
		id,
		drp: options.drp,
		metrics: options.metrics,
	});
	node.objectStore.put(id, object);

	await fetchState(node, id, options.peerId);
	// sync process needs to finish before subscribing
	const retry = setInterval(async () => {
		if (object.acl) {
			await syncObject(node, id, options.peerId);
			await subscribeObject(node, id);
			object.subscribe((obj, originFn, vertices) => {
				drpObjectChangesHandler(node, obj, originFn, vertices);
			});
			clearInterval(retry);
		}
	}, 1000);
	return object;
}

/* data: { id: string } */
export async function subscribeObject(node: DRPNode, objectId: string) {
	node.networkNode.subscribe(objectId);
	node.networkNode.addGroupMessageHandler(
		objectId,
		async (e: CustomEvent<GossipsubMessage>) =>
			await drpMessagesHandler(node, undefined, e.detail.msg.data)
	);
}

export function unsubscribeObject(node: DRPNode, objectId: string, purge?: boolean) {
	node.networkNode.unsubscribe(objectId);
	if (purge) node.objectStore.remove(objectId);
}

export async function fetchState(node: DRPNode, objectId: string, peerId?: string) {
	const data = FetchState.create({
		objectId,
		vertexHash: HashGraph.rootHash,
	});
	const message = Message.create({
		sender: node.networkNode.peerId,
		type: MessageType.MESSAGE_TYPE_FETCH_STATE,
		data: FetchState.encode(data).finish(),
	});

	if (!peerId) {
		await node.networkNode.sendGroupMessageRandomPeer(objectId, message);
	} else {
		await node.networkNode.sendMessage(peerId, message);
	}
}

/*
  data: { vertex_hashes: string[] }
*/
export async function syncObject(node: DRPNode, objectId: string, peerId?: string) {
	const object: DRPObject | undefined = node.objectStore.get(objectId);
	if (!object) {
		log.error("::syncObject: Object not found");
		return;
	}
	const data = Sync.create({
		objectId,
		vertexHashes: object.vertices.map((v) => v.hash),
	});
	const message = Message.create({
		sender: node.networkNode.peerId,
		type: MessageType.MESSAGE_TYPE_SYNC,
		data: Sync.encode(data).finish(),
	});

	if (!peerId) {
		await node.networkNode.sendGroupMessageRandomPeer(objectId, message);
	} else {
		await node.networkNode.sendMessage(peerId, message);
	}
}
