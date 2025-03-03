import { RecursiveMulDRP } from "@ts-drp/blueprints";
import { DRPNode } from "@ts-drp/node";
import { DRPObject } from "@ts-drp/object";

interface RecursiveMulState {
	node: DRPNode;
	drpObject: DRPObject | undefined;
	recursiveMulDRP: RecursiveMulDRP | undefined;
	peers: string[];
	discoveryPeers: string[];
	objectPeers: string[];
}

export const recursiveMulState: RecursiveMulState = {
	node: new DRPNode(),
	drpObject: undefined,
	recursiveMulDRP: undefined,
	peers: [],
	discoveryPeers: [],
	objectPeers: [],
};
