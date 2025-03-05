export function isPromise<T>(obj: unknown): obj is Promise<T> {
	return typeof (obj as { then?: unknown })?.then === "function";
}

export function isGenerator(obj: unknown): obj is Generator {
	if (!obj) return false;
	const iterator = (obj as { [Symbol.iterator]?: unknown })?.[Symbol.iterator];
	if (typeof iterator !== "function") return false;

	const instance = obj as { next?: unknown };
	return typeof instance.next === "function";
}

export function isAsyncGenerator(obj: unknown): obj is AsyncGenerator {
	if (!obj) return false;
	const asyncIterator = (obj as { [Symbol.asyncIterator]?: unknown })?.[Symbol.asyncIterator];
	if (typeof asyncIterator !== "function") return false;

	const instance = obj as { next?: unknown };
	return typeof instance.next === "function";
}
