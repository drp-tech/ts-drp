import type { IDRPObject } from "@ts-drp/types";

export type DRPObjectStoreCallback = (objectId: string, object: IDRPObject) => void;

export class DRPObjectStore {
	private _store: Map<string, IDRPObject>;
	private _subscriptions: Map<string, DRPObjectStoreCallback[]>;

	constructor() {
		this._store = new Map<string, IDRPObject>();
		this._subscriptions = new Map<string, DRPObjectStoreCallback[]>();
	}

	get(objectId: string): IDRPObject | undefined {
		return this._store.get(objectId);
	}

	put(objectId: string, object: IDRPObject): void {
		this._store.set(objectId, object);
		this._notifySubscribers(objectId, object);
	}

	subscribe(objectId: string, callback: DRPObjectStoreCallback): void {
		if (!this._subscriptions.has(objectId)) {
			this._subscriptions.set(objectId, []);
		}
		this._subscriptions.get(objectId)?.push(callback);
	}

	unsubscribe(objectId: string, callback: DRPObjectStoreCallback): void {
		const callbacks = this._subscriptions.get(objectId);
		if (callbacks) {
			this._subscriptions.set(
				objectId,
				callbacks.filter((c) => c !== callback)
			);
		}
	}

	private _notifySubscribers(objectId: string, object: IDRPObject): void {
		const callbacks = this._subscriptions.get(objectId);
		if (callbacks) {
			for (const callback of callbacks) {
				callback(objectId, object);
			}
		}
	}

	remove(objectId: string): void {
		this._store.delete(objectId);
	}
}
