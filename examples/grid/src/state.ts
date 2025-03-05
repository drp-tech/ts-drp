import { DRPNode } from "@ts-drp/node";
import { type DRPObject } from "@ts-drp/object";

import { type Grid } from "./objects/grid";

interface GridState {
	node: DRPNode;
	drpObject: DRPObject | undefined;
	gridDRP: Grid | undefined;
	peers: string[];
	discoveryPeers: string[];
	objectPeers: string[];
}

export const gridState: GridState = {
	node: new DRPNode(),
	drpObject: undefined,
	gridDRP: undefined,
	peers: [],
	discoveryPeers: [],
	objectPeers: [],
};
