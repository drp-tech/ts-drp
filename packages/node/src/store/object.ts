/* eslint-disable @typescript-eslint/no-explicit-any -- DRPObject is not typed on purpose to allow for dynamic typing */
import type { IDRP, IDRPObject } from "@ts-drp/types";

export interface DRPObjectStoreCallback<T extends IDRP = any> {
	(objectId: string, object: IDRPObject<T>): void;
}

export class DRPObjectStore<T extends IDRP = any> {
	private _store: Map<string, IDRPObject<T>>;
	private _subscriptions: Map<string, DRPObjectStoreCallback[]>;

	constructor() {
		this._store = new Map<string, IDRPObject<T>>();
		this._subscriptions = new Map<string, DRPObjectStoreCallback<T>[]>();
	}

	get(objectId: string): IDRPObject<T> | undefined {
		return this._store.get(objectId);
	}

	put(objectId: string, object: IDRPObject<T>): void {
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

	private _notifySubscribers(objectId: string, object: IDRPObject<T>): void {
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
