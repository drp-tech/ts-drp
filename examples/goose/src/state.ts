import { DRPNode } from "@ts-drp/node";
import { DRPObject } from "@ts-drp/object";
import { GooseWorld } from "./objects/world";
import { WorldRenderer } from "./render/scene";

export interface GameState {
    node: DRPNode | undefined;
    drpObject: DRPObject<GooseWorld> | undefined;
    world: GooseWorld | undefined;
    playerId: string | undefined;
    peers: string[];
    objectPeers: string[];
    renderer: WorldRenderer | undefined;
}

class GameStateManager implements GameState {
    node: DRPNode | undefined = undefined;
    drpObject: DRPObject<GooseWorld> | undefined = undefined;
    world: GooseWorld | undefined = undefined;
    playerId: string | undefined = undefined;
    peers: string[] = [];
    objectPeers: string[] = [];
    renderer: WorldRenderer | undefined = undefined;

    getNode(): DRPNode {
        if (!this.node) {
            throw new Error('DRP node not initialized');
        }
        return this.node;
    }

    isWorldInitialized(): boolean {
        return this.world !== undefined && this.playerId !== undefined;
    }
}

export const gameState = new GameStateManager();
