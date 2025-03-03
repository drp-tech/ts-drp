/* eslint-disable @typescript-eslint/no-explicit-any -- DRPObject is not typed on purpose to allow for dynamic typing */
import type { DRP, DRPObject } from "@ts-drp/object";

export type DRPObjectStoreCallback<T extends DRP = any> = (
	objectId: string,
	object: DRPObject<T>
) => void;

export class DRPObjectStore<T extends DRP = any> {
	private _store: Map<string, DRPObject<T>>;
	private _subscriptions: Map<string, DRPObjectStoreCallback<T>[]>;

	constructor() {
		this._store = new Map();
		this._subscriptions = new Map();
	}

	get(objectId: string): DRPObject<T> | undefined {
		return this._store.get(objectId);
	}

	put(objectId: string, object: DRPObject<T>): void {
		this._store.set(objectId, object);
		this._notifySubscribers(objectId, object);
	}

	subscribe(objectId: string, callback: DRPObjectStoreCallback<T>): void {
		if (!this._subscriptions.has(objectId)) {
			this._subscriptions.set(objectId, []);
		}
		this._subscriptions.get(objectId)?.push(callback);
	}

	unsubscribe(objectId: string, callback: DRPObjectStoreCallback<T>): void {
		const callbacks = this._subscriptions.get(objectId);
		if (callbacks) {
			this._subscriptions.set(
				objectId,
				callbacks.filter((c) => c !== callback)
			);
		}
	}

	private _notifySubscribers(objectId: string, object: DRPObject<T>): void {
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
