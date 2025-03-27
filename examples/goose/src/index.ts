import { DRPNode } from "@ts-drp/node";
import { OpentelemetryMetrics, enableTracing } from "@ts-drp/tracer";
import { DRPNodeConfig, IMetrics } from "@ts-drp/types";
import { DRPObject } from '@ts-drp/object';

import { AudioManager } from './audio/bgm';
import { PhysicsEngine } from './objects/physics';
import { GooseWorld } from './objects/world';
import { WorldRenderer } from './render/scene';
import { gameState } from './state';
import { PlayerController } from './controls/player';

function getNetworkConfigFromEnv(): DRPNodeConfig {
    return {
        network_config: {
            browser_metrics: true,
            pubsub: {
                peer_discovery_interval: 1000,
            },
        },
    };
}

function createConnectHandlers(): void {
    const node = gameState.getNode();

	if (gameState.drpObject) {
		gameState.objectPeers = node.networkNode.getGroupPeers(gameState.drpObject.id);
	}

	const objectId = gameState.drpObject?.id;
	if (!objectId) return;

	node.messageQueueManager.subscribe(objectId, () => {
		if (!gameState.drpObject?.id) return;
		gameState.objectPeers = node.networkNode.getGroupPeers(gameState.drpObject?.id);
		renderInfo();
	});

	node.objectStore.subscribe(objectId, () => {
		renderInfo();
	});
}

function renderInfo(): void {
    const nodeIdElement = document.getElementById('nodeId');
    const peersElement = document.getElementById('peers');
    const playersElement = document.getElementById('players');
    const verticesElement = document.getElementById('vertices');

    if (nodeIdElement && gameState.node) {
        nodeIdElement.textContent = gameState.node.networkNode.peerId.slice(0, 10) + '...';
    }

    if (peersElement) {
        peersElement.textContent = gameState.getNode().networkNode.getAllPeers().length.toString();
    }

    if (playersElement && gameState.world) {
        playersElement.textContent = gameState.world.getAllPlayers().length.toString();
    }
    
    // Display the number of vertices in the hashgraph
    if (verticesElement && gameState.drpObject) {
        const verticesCount = gameState.drpObject.vertices.length;
        verticesElement.textContent = verticesCount.toString();
    }
}

async function createWorld(metrics?: IMetrics): Promise<void> {
    const node = gameState.getNode();

    try {
        const drpObject = await node.createObject({
            drp: new GooseWorld(),
            metrics,
        }) as DRPObject<GooseWorld>;

        gameState.drpObject = drpObject;
        gameState.world = drpObject.drp as GooseWorld;
        createConnectHandlers();

        // Use networkNode.peerId instead of accessing 'id' directly
        gameState.playerId = node.networkNode.peerId;
        if (gameState.world) {
            // Add player using the network node peer ID
            gameState.world.addPlayer(node.networkNode.peerId);
            
            // Force player to a visible position for debugging
            const player = gameState.world.getPlayerState(node.networkNode.peerId);
            if (player) {
                player.position.set(0, 15, 0); // Position high above ground
                console.log('Forced player position to:', player.position);
            }
            
            // Initialize terrain in the renderer
            if (gameState.renderer) {
                console.log('Initializing terrain with:', gameState.world.getTerrain());
                gameState.renderer.initializeTerrain(gameState.world.getTerrain());
                console.log('Terrain initialized');
                
                // Force an immediate render of the player
                const player = gameState.world.getPlayerState(node.networkNode.peerId);
                if (player) {
                    gameState.renderer.updatePlayerRender(node.networkNode.peerId, player);
                    console.log('Forced initial player render');
                }
            } else {
                console.error('Renderer not available when trying to initialize terrain');
            }
            
            // Add debug UI for player position
            addDebugUI();
        }

        console.log('Successfully created world:', drpObject.id);
        renderInfo();
    } catch (e) {
        console.error('Error while creating world:', e);
        throw e;
    }
}

async function joinWorld(worldId: string, metrics?: IMetrics): Promise<void> {
    const node = gameState.getNode();

    try {
        const drpObject = await node.connectObject({
            id: worldId,
            drp: new GooseWorld(),
            metrics,
        }) as DRPObject<GooseWorld>;

        gameState.drpObject = drpObject;
        gameState.world = drpObject.drp as GooseWorld;
        createConnectHandlers();
        
        // Use networkNode.peerId instead of accessing 'id' directly
        gameState.playerId = node.networkNode.peerId;
        if (gameState.world) {
            // Add player using the network node peer ID
            gameState.world.addPlayer(node.networkNode.peerId);
            
            // Force player to a visible position for debugging
            const player = gameState.world.getPlayerState(node.networkNode.peerId);
            if (player) {
                player.position.set(0, 15, 0); // Position high above ground
                console.log('Forced player position to:', player.position);
            }
            
            // Initialize terrain in the renderer
            if (gameState.renderer) {
                console.log('Initializing terrain with:', gameState.world.getTerrain());
                gameState.renderer.initializeTerrain(gameState.world.getTerrain());
                console.log('Terrain initialized');
                
                // Force an immediate render of the player
                const player = gameState.world.getPlayerState(node.networkNode.peerId);
                if (player) {
                    gameState.renderer.updatePlayerRender(node.networkNode.peerId, player);
                    console.log('Forced initial player render');
                }
            } else {
                console.error('Renderer not available when trying to initialize terrain');
            }
            
            // Add debug UI for player position
            addDebugUI();
        }
        
        console.log('Successfully joined world:', worldId);
        renderInfo();
    } catch (e) {
        console.error('Error while joining world:', worldId, e);
        throw e;
    }
}

function run(metrics?: IMetrics): void {
    const renderer = new WorldRenderer();
    const physics = new PhysicsEngine();
    const playerController = new PlayerController(physics);
    const audio = new AudioManager();
    
    // Store renderer in gameState for access from other functions
    gameState.renderer = renderer;
    console.log('Renderer initialized and stored in gameState');

    const createButton = document.getElementById('createWorld') as HTMLButtonElement;
    createButton?.addEventListener('click', async () => {
        try {
            await createWorld(metrics);
        } catch (error) {
            console.error('Error creating world:', error);
        }
    });

    const joinButton = document.getElementById('joinWorld') as HTMLButtonElement;
    const worldInput = document.getElementById('worldInput') as HTMLInputElement;
    
    worldInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            joinButton?.click();
        }
    });

    joinButton?.addEventListener('click', async () => {
        const worldId = worldInput.value.trim();
        if (worldId) {
            try {
                await joinWorld(worldId, metrics);
            } catch (error) {
                console.error('Error joining world:', error);
            }
        }
    });

    audio.initialize(renderer.getCamera())
        .then(() => audio.play())
        .catch(error => console.error('Error initializing audio:', error));

    let lastTime = 0;
    function gameLoop(time: number): void {
        // Cap deltaTime to prevent large physics steps when tab is inactive
        const maxDeltaTime = 0.05; // Maximum of 50ms between frames
        const deltaTime = Math.min((time - lastTime) / 1000, maxDeltaTime);
        lastTime = time;

        if (gameState.isWorldInitialized()) {
            playerController.update(deltaTime);
            
            const players = gameState.world!.getAllPlayers();
            if (Math.floor(time / 5000) !== Math.floor(lastTime / 5000)) {
                console.log(`Updating ${players.length} players in render loop`);
            }
            
            for (const player of players) {
                renderer.updatePlayerRender(player.id, player);
            }
        }

        renderer.render();
        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
    renderInfo();
}

async function main(): Promise<void> {
    console.log('Starting Goose World...')
    let metrics: IMetrics | undefined = undefined;
    enableTracing();
    metrics = new OpentelemetryMetrics('goose-world');

    let hasRun = false;
    
    const networkConfig = getNetworkConfigFromEnv();
    gameState.node = new DRPNode(networkConfig);
    console.log('Starting node...')
    await gameState.node.start();
    console.log('Node started')

    await gameState.node.networkNode.isDialable(() => {
        console.log('Started node', gameState.getNode().networkNode.peerId);
        if (hasRun) return;
        hasRun = true;
        run(metrics);
    });

    if (!hasRun) {
        setInterval(renderInfo, 1000);
    }
}

main().catch(error => {
    console.error('Error in main:', error);
});

function addDebugUI() {
    const debugDiv = document.createElement('div');
    debugDiv.id = 'debug-info';
    debugDiv.style.position = 'absolute';
    debugDiv.style.top = '10px';
    debugDiv.style.right = '10px';
    debugDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    debugDiv.style.color = 'white';
    debugDiv.style.padding = '10px';
    debugDiv.style.borderRadius = '5px';
    debugDiv.style.fontFamily = 'monospace';
    debugDiv.style.zIndex = '1000';
    document.body.appendChild(debugDiv);
    
    // Update debug info every frame
    function updateDebugInfo() {
        if (gameState.world && gameState.playerId) {
            const player = gameState.world.getPlayerState(gameState.playerId);
            if (player) {
                debugDiv.innerHTML = `
                    <div>Player ID: ${gameState.playerId.slice(0, 8)}...</div>
                    <div>Position: X:${player.position.x.toFixed(2)} Y:${player.position.y.toFixed(2)} Z:${player.position.z.toFixed(2)}</div>
                    <div>Velocity: X:${player.velocity.x.toFixed(2)} Y:${player.velocity.y.toFixed(2)} Z:${player.velocity.z.toFixed(2)}</div>
                    <div>Rotation: ${player.rotation.toFixed(2)}</div>
                    <div>Jumping: ${player.isJumping}</div>
                `;
            }
        }
        requestAnimationFrame(updateDebugInfo);
    }
    updateDebugInfo();
}
