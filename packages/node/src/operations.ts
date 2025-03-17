import { type GossipsubMessage } from "@chainsafe/libp2p-gossipsub";
import { DRPObject as DRPObjectImpl, HashGraph } from "@ts-drp/object";
import {
	FetchState,
	type IDRP,
	type IDRPObject,
	type IMetrics,
	Message,
	MessageType,
	Sync,
} from "@ts-drp/types";

import { drpObjectChangesHandler, gossipSubHandler } from "./handlers.js";
import { type DRPNode } from "./index.js";
import { log } from "./logger.js";

export function createObject(node: DRPNode, object: IDRPObject): void {
	node.objectStore.put(object.id, object);
	object.subscribe((obj, originFn, vertices) => {
		drpObjectChangesHandler(node, obj, originFn, vertices);
	});
}

export type ConnectObjectOptions = {
	drp?: IDRP;
	peerId?: string;
	metrics?: IMetrics;
};

export async function connectObject(
	node: DRPNode,
	id: string,
	options: ConnectObjectOptions
): Promise<IDRPObject> {
	const object = DRPObjectImpl.createObject({
		peerId: node.networkNode.peerId,
		id,
		drp: options.drp,
		metrics: options.metrics,
	});
	node.objectStore.put(id, object);

	await fetchState(node, id, options.peerId);
	// sync process needs to finish before subscribing
	// TODO: since when the interval can run this twice do we really want it to be runned while the other one might still be running?
	const intervalFn = (interval: NodeJS.Timeout) => async (): Promise<void> => {
		if (object.acl) {
			await syncObject(node, id, options.peerId);
			subscribeObject(node, id);
			object.subscribe((obj, originFn, vertices) => {
				drpObjectChangesHandler(node, obj as IDRPObject, originFn, vertices);
			});
			clearInterval(interval);
		}
	};
	const retry = setInterval(() => void intervalFn(retry)(), 1000);
	return object;
}

/* data: { id: string } */
export function subscribeObject(node: DRPNode, objectId: string): void {
	node.networkNode.subscribe(objectId);
	node.networkNode.addGroupMessageHandler(
		objectId,
		(e: CustomEvent<GossipsubMessage>) => void gossipSubHandler(node, e.detail.msg.data)
	);
}

export function unsubscribeObject(node: DRPNode, objectId: string, purge?: boolean): void {
	node.networkNode.unsubscribe(objectId);
	if (purge) node.objectStore.remove(objectId);
}

export async function fetchState(node: DRPNode, objectId: string, peerId?: string): Promise<void> {
	const data = FetchState.create({
		vertexHash: HashGraph.rootHash,
	});
	const message = Message.create({
		sender: node.networkNode.peerId,
		type: MessageType.MESSAGE_TYPE_FETCH_STATE,
		data: FetchState.encode(data).finish(),
		objectId: objectId,
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
export async function syncObject(node: DRPNode, objectId: string, peerId?: string): Promise<void> {
	const object: IDRPObject | undefined = node.objectStore.get(objectId);
	if (!object) {
		log.error("::syncObject: Object not found");
		return;
	}
	const data = Sync.create({
		vertexHashes: object.vertices.map((v) => v.hash),
	});
	const message = Message.create({
		sender: node.networkNode.peerId,
		type: MessageType.MESSAGE_TYPE_SYNC,
		data: Sync.encode(data).finish(),
		objectId: objectId,
	});

	if (!peerId) {
		await node.networkNode.sendGroupMessageRandomPeer(objectId, message);
	} else {
		await node.networkNode.sendMessage(peerId, message);
	}
}
