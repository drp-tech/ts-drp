import { decode, encode, ExtensionCodec } from "@msgpack/msgpack";

const extensionCodec = new ExtensionCodec();

const SET_EXT_TYPE = 0; // Any in 0-127
extensionCodec.register({
	type: SET_EXT_TYPE,
	encode: (object: unknown): Uint8Array | null => {
		if (object instanceof Set) {
			return encode([...object], { extensionCodec });
		} else {
			return null;
		}
	},
	decode: (data: Uint8Array) => {
		const array = decode(data, { extensionCodec }) as Array<unknown>;
		return new Set(array);
	},
});

// Map<K, V>
const MAP_EXT_TYPE = 1; // Any in 0-127
extensionCodec.register({
	type: MAP_EXT_TYPE,
	encode: (object: unknown): Uint8Array | null => {
		if (object instanceof Map) {
			return encode([...object], { extensionCodec });
		} else {
			return null;
		}
	},
	decode: (data: Uint8Array) => {
		const array = decode(data, { extensionCodec }) as Array<[unknown, unknown]>;
		return new Map(array);
	},
});

const FLOAT_32_ARRAY_EXT_TYPE = 2; // Any in 0-127
extensionCodec.register({
	type: FLOAT_32_ARRAY_EXT_TYPE,
	encode: (object: unknown): Uint8Array | null => {
		if (object instanceof Float32Array) {
			return encode([...object], { extensionCodec });
		} else {
			return null;
		}
	},
	decode: (data: Uint8Array) => {
		const array = decode(data, { extensionCodec }) as Array<number>;
		return new Float32Array(array);
	},
});

/**
 * Main entry point for serialization.
 * Converts any value into a Uint8Array using Protocol Buffers.
 */
export function serializeValue(obj: unknown): Uint8Array {
	return encode(obj, { extensionCodec });
}

/**
 * Main entry point for deserialization.
 * Converts a Uint8Array back into the original value structure.
 */
export function deserializeValue(value: Uint8Array): unknown {
	return decode(value, { extensionCodec });
}
