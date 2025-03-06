import type { DRPObject } from "@ts-drp/object";

export type DRPObjectStoreCallback = (objectId: string, object: DRPObject) => void;

export class DRPObjectStore {
	private _store: Map<string, DRPObject>;
	private _subscriptions: Map<string, DRPObjectStoreCallback[]>;

	constructor() {
		this._store = new Map<string, DRPObject>();
		this._subscriptions = new Map<string, DRPObjectStoreCallback[]>();
	}

	get(objectId: string): DRPObject | undefined {
		return this._store.get(objectId);
	}

	put(objectId: string, object: DRPObject): void {
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

	private _notifySubscribers(objectId: string, object: DRPObject): void {
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
