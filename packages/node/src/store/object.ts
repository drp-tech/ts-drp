/* eslint-disable @typescript-eslint/no-explicit-any -- DRPObject is not typed on purpose to allow for dynamic typing */
import type { DRPObjectSubscribeCallback, IDRP, IDRPObject } from "@ts-drp/types";

/**
 * A store for DRP objects.
 */
export class DRPObjectStore<T extends IDRP = any> {
	private _store: Map<string, IDRPObject<T>>;
	private _subscriptions: Map<string, DRPObjectSubscribeCallback[]>;

	/**
	 * Create a new DRPObjectStore.
	 */
	constructor() {
		this._store = new Map<string, IDRPObject<T>>();
		this._subscriptions = new Map<string, DRPObjectSubscribeCallback<T>[]>();
	}

	/**
	 * Get an object from the store.
	 * @param objectId - The ID of the object to get.
	 * @returns The object, or undefined if it does not exist.
	 */
	get(objectId: string): IDRPObject<T> | undefined {
		return this._store.get(objectId);
	}

	/**
	 * Put an object into the store.
	 * @param objectId - The ID of the object to put.
	 * @param object - The object to put.
	 */
	put(objectId: string, object: IDRPObject<T>): void {
		this._store.set(objectId, object);
		this._notifySubscribers(objectId, object);
	}

	/**
	 * Subscribe to changes to an object.
	 * @param objectId - The ID of the object to subscribe to.
	 * @param callback - The callback to call when the object changes.
	 */
	subscribe(objectId: string, callback: DRPObjectSubscribeCallback<T>): void {
		if (!this._subscriptions.has(objectId)) {
			this._subscriptions.set(objectId, []);
		}
		this._subscriptions.get(objectId)?.push(callback);
	}

	/**
	 * Unsubscribe from changes to an object.
	 * @param objectId - The ID of the object to unsubscribe from.
	 * @param callback - The callback to unsubscribe from.
	 */
	unsubscribe(objectId: string, callback: DRPObjectSubscribeCallback<T>): void {
		const callbacks = this._subscriptions.get(objectId);
		if (callbacks) {
			this._subscriptions.set(
				objectId,
				callbacks.filter((c) => c !== callback)
			);
		}
	}

	/**
	 * Remove an object from the store.
	 * @param objectId - The ID of the object to remove.
	 */
	remove(objectId: string): void {
		this._store.delete(objectId);
	}

	private _notifySubscribers(objectId: string, object: IDRPObject<T>): void {
		const callbacks = this._subscriptions.get(objectId);
		if (callbacks) {
			for (const callback of callbacks) {
				callback(objectId, object);
			}
		}
	}
}
