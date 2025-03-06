import { ActionType, type Operation, type Vertex } from "@ts-drp/types";

import { type Hash, type HashGraph } from "../hashgraph/index.js";
import type { ObjectSet } from "../utils/objectSet.js";

export function linearizeMultipleSemantics(
	hashGraph: HashGraph,
	origin: Hash,
	subgraph: ObjectSet<string>
): Operation[] {
	const order = hashGraph.topologicalSort(true, origin, subgraph);
	const result: Operation[] = [];
	// if there is no resolveConflicts function, we can just return the operations in topological order
	if (!hashGraph.resolveConflictsACL && !hashGraph.resolveConflictsDRP) {
		for (let i = 1; i < order.length; i++) {
			const op = hashGraph.vertices.get(order[i])?.operation;
			if (op && op.value !== null) {
				result.push(op);
			}
		}
		return result;
	}
	const dropped = new Array(order.length).fill(false);
	const indices: Map<Hash, number> = new Map();
	// always remove the first operation
	let i = 1;

	while (i < order.length) {
		if (dropped[i]) {
			i++;
			continue;
		}
		const anchor = order[i];
		let j = i + 1;

		while (j < order.length) {
			if (hashGraph.areCausallyRelatedUsingBitsets(anchor, order[j]) || dropped[j]) {
				j++;
				continue;
			}
			const moving = order[j];

			const concurrentOps: Hash[] = [];
			concurrentOps.push(anchor);
			indices.set(anchor, i);
			concurrentOps.push(moving);
			indices.set(moving, j);

			let k = j + 1;
			while (k < order.length) {
				if (dropped[k]) {
					k++;
					continue;
				}

				let add = true;
				for (const hash of concurrentOps) {
					if (hashGraph.areCausallyRelatedUsingBitsets(hash, order[k])) {
						add = false;
						break;
					}
				}
				if (add) {
					concurrentOps.push(order[k]);
					indices.set(order[k], k);
				}
				k++;
			}

			const resolved = hashGraph.resolveConflicts(
				concurrentOps.map((hash) => hashGraph.vertices.get(hash) as Vertex)
			);

			switch (resolved.action) {
				case ActionType.Drop: {
					for (const hash of resolved.vertices || []) {
						dropped[indices.get(hash) || -1] = true;
					}
					if (dropped[i]) {
						j = order.length;
					}
					break;
				}
				case ActionType.Nop:
					j++;
					break;
				default:
					break;
			}
		}

		if (!dropped[i]) {
			const op = hashGraph.vertices.get(order[i])?.operation;
			if (op && op.value !== null) result.push(op);
		}
		i++;
	}

	return result;
}
