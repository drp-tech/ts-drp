import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { type Hash, Vertex } from "@ts-drp/types";

export function computeHash(vertex: Vertex): Hash {
	const hash = sha256.create().update(Vertex.encode(vertex).finish()).digest();
	return bytesToHex(hash);
}
