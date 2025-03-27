import { ActionType, type Hash, type Vertex } from "@ts-drp/types";
import type { ObjectSet } from "@ts-drp/utils";

import { type HashGraph } from "../hashgraph/index.js";

export function linearizePairSemantics(hashGraph: HashGraph, origin: Hash, subgraph: ObjectSet<string>): Vertex[] {
	const order = hashGraph.topologicalSort(true, origin, subgraph);
	const result: Vertex[] = [];
	// if there is no resolveConflicts function, we can just return the operations in topological order
	if (!hashGraph.resolveConflictsACL && !hashGraph.resolveConflictsDRP) {
		for (let i = 1; i < order.length; i++) {
			const vertex = hashGraph.vertices.get(order[i]);
			if (vertex) {
				result.push(vertex);
			}
		}
		return result;
	}
	const dropped = new Array<boolean>(order.length).fill(false);

	// Skip root operation
	for (let i = 1; i < order.length; i++) {
		if (dropped[i]) continue;

		let anchor = order[i];
		let modified = false;

		// Compare with all later operations
		for (let j = i + 1; j < order.length; j++) {
			if (dropped[j] || hashGraph.areCausallyRelatedUsingBitsets(anchor, order[j])) {
				continue;
			}

			const v1 = hashGraph.vertices.get(anchor);
			const v2 = hashGraph.vertices.get(order[j]);

			if (!v1 || !v2) {
				continue;
			}

			const { action } = hashGraph.resolveConflicts([v1, v2]);

			switch (action) {
				case ActionType.DropLeft:
					dropped[i] = true;
					modified = true;
					break;
				case ActionType.DropRight:
					dropped[j] = true;
					break;
				case ActionType.Swap:
					hashGraph.swapReachablePredecessors(order[i], order[j]);
					[order[i], order[j]] = [order[j], order[i]];
					j = i + 1;
					anchor = order[i];
					break;
			}

			if (modified) break;
		}

		if (!dropped[i]) {
			const vertex = hashGraph.vertices.get(order[i]);
			if (vertex) {
				result.push(vertex);
			}
		}
	}
	return result;
}
