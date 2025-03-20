import { type GossipsubMessage } from "@chainsafe/libp2p-gossipsub";
import { DRPObject as DRPObjectImpl, HashGraph } from "@ts-drp/object";
import {
	type ConnectObjectOptions,
	FetchState,
	type IDRP,
	type IDRPObject,
	Message,
	MessageType,
	Sync,
} from "@ts-drp/types";

import { drpMessagesHandler, drpObjectChangesHandler } from "./handlers.js";
import { type DRPNode } from "./index.js";
import { log } from "./logger.js";

export function createObject<T extends IDRP>(node: DRPNode, object: IDRPObject<T>): void {
	node.objectStore.put(object.id, object);
	object.subscribe((obj, originFn, vertices) => {
		drpObjectChangesHandler(node, obj, originFn, vertices);
	});
}

export async function connectObject<T extends IDRP>(
	node: DRPNode,
	id: string,
	options: ConnectObjectOptions<T>
): Promise<IDRPObject<T>> {
	const object = DRPObjectImpl.createObject({
		peerId: node.networkNode.peerId,
		id,
		drp: options.drp,
		metrics: options.metrics,
		log_config: options.log_config,
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
				drpObjectChangesHandler(node, obj, originFn, vertices);
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
		(e: CustomEvent<GossipsubMessage>) => void drpMessagesHandler(node, undefined, e.detail.msg.data)
	);
}

export function unsubscribeObject(node: DRPNode, objectId: string, purge?: boolean): void {
	node.networkNode.unsubscribe(objectId);
	if (purge) node.objectStore.remove(objectId);
}

export async function fetchState(node: DRPNode, objectId: string, peerId?: string): Promise<void> {
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

/**
 *  data: { vertex_hashes: string[] }
 */
export async function syncObject<T extends IDRP>(node: DRPNode, objectId: string, peerId?: string): Promise<void> {
	const object: IDRPObject<T> | undefined = node.objectStore.get(objectId);
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
