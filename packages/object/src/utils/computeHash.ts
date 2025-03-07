import type { Hash, Operation } from "@ts-drp/types";
import * as crypto from "node:crypto";

export function computeHash(
	peerId: string,
	operation: Operation | undefined,
	deps: Hash[],
	timestamp: number
): Hash {
	const serialized = JSON.stringify({ operation, deps, peerId, timestamp });
	const hash = crypto.createHash("sha256").update(serialized).digest("hex");
	return hash;
}
