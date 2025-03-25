import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import type { Hash, Operation } from "@ts-drp/types";

export function computeHash(peerId: string, operation: Operation | undefined, deps: Hash[], timestamp: number): Hash {
	const serialized = JSON.stringify({ operation, deps, peerId, timestamp });
	const hash = sha256.create().update(serialized).digest();
	return bytesToHex(hash);
}
