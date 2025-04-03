import { HashGraph } from "@ts-drp/object";
import { FetchState, type IDRP, type IDRPObject, Message, MessageType, Sync } from "@ts-drp/types";

import { type DRPNode } from "./index.js";
import { log } from "./logger.js";

/**
 * Fetches the state of an object.
 * @param node - The node.
 * @param objectId - The object ID.
 * @param peerId - The peer ID.
 */
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

/**
 * Syncs an object.
 * @param node - The node.
 * @param objectId - The object ID.
 * @param peerId - The peer ID.
 */
export async function syncObject<T extends IDRP>(node: DRPNode, objectId: string, peerId?: string): Promise<void> {
	const object: IDRPObject<T> | undefined = node.get(objectId);
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
