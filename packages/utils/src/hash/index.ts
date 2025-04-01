import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { type Hash, Vertex } from "@ts-drp/types";

export function computeHash(vertex: Vertex): Hash {
	const serialized = Vertex.encode(vertex).finish();
	const hash = sha256.create().update(serialized).digest();
	return bytesToHex(hash);
}
