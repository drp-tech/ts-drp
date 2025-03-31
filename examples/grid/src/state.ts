import { type DRPNode } from "@ts-drp/node";
import { type IDRPObject } from "@ts-drp/types";

import { type Grid } from "./objects/grid";

interface GridState {
	node: DRPNode | undefined;
	drpObject: IDRPObject<Grid> | undefined;
	gridDRP: Grid | undefined;
	peers: string[];
	discoveryPeers: string[];
	objectPeers: string[];

	isNodeInitialized(): boolean;
	isGridInitialized(): boolean;
	getNode(): DRPNode;
	getGridDRP(): Grid;
	getObjectId(): string | undefined;
}

class GridStateManager implements GridState {
	node: DRPNode | undefined = undefined;
	drpObject: IDRPObject<Grid> | undefined = undefined;
	gridDRP: Grid | undefined = undefined;
	peers: string[] = [];
	discoveryPeers: string[] = [];
	objectPeers: string[] = [];

	isNodeInitialized(): boolean {
		if (!this.node) {
			console.error("Node not initialized");
			return false;
		}
		return true;
	}

	isGridInitialized(): boolean {
		if (!this.gridDRP) {
			console.error("Grid DRP not initialized");
			return false;
		}
		return true;
	}

	getNode(): DRPNode {
		if (!this.node) {
			throw new Error("Node not initialized");
		}
		return this.node;
	}

	getGridDRP(): Grid {
		if (!this.gridDRP) {
			throw new Error("Grid DRP not initialized");
		}
		return this.gridDRP;
	}

	getObjectId(): string | undefined {
		return this.drpObject?.id;
	}
}

export const gridState = new GridStateManager();
