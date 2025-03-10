import { DRPNode } from "@ts-drp/node";
import { DRPObject } from "@ts-drp/object";

import { Grid } from "./objects/grid";

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
