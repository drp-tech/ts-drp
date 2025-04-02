import { type TopicScoreParams } from "@chainsafe/libp2p-gossipsub/score";
import { type Address, type PeerId } from "@libp2p/interface";
import { type MultiaddrInput } from "@multiformats/multiaddr";

import { type LoggerOptions } from "./logger.js";
import { type IMessageQueueHandler } from "./message-queue.js";
import { type Message } from "./proto/drp/v1/messages_pb.js";

/**
 * Configuration interface for DRP Network Node
 */
export interface DRPNetworkNodeConfig {
	/** List of addresses to announce to the network */
	announce_addresses?: string[];
	/** Whether this node is a bootstrap node */
	bootstrap?: boolean;
	/** List of bootstrap peers to connect to */
	bootstrap_peers?: string[];
	/** Whether to enable browser metrics */
	browser_metrics?: boolean;
	/** List of addresses to listen on */
	listen_addresses?: string[];
	/** Logger configuration options */
	log_config?: LoggerOptions;
	/** Pubsub configuration */
	pubsub?: {
		/** Interval in milliseconds between peer discovery attempts */
		peer_discovery_interval?: number;
		/** Whether to enable prometheus metrics */
		prometheus_metrics?: boolean;
		/** URL of the pushgateway to send metrics to */
		pushgateway_url?: string;
	};
}

/**
 * Interface for DRP Network Node
 */
export interface DRPNetworkNode {
	/**
	 * The unique identifier of this node in the network
	 */
	peerId: string;

	/**
	 * Starts the network node and begins listening for connections
	 * @param [rawPrivateKey] - Optional raw private key for node identity
	 * @returns Resolves when the node has started
	 * @throws {Error} If the node is already started
	 */
	start(rawPrivateKey?: Uint8Array): Promise<void>;

	/**
	 * Stops the network node and closes all connections
	 * @returns Resolves when the node has stopped
	 * @throws {Error} If the node is not started
	 */
	stop(): Promise<void>;

	/**
	 * Restarts the network node with optional new configuration
	 * @param [config] - New configuration to apply
	 * @param [rawPrivateKey] - New raw private key for node identity
	 * @returns Resolves when the node has restarted
	 */
	restart(config?: DRPNetworkNodeConfig, rawPrivateKey?: Uint8Array): Promise<void>;

	/**
	 * Checks if the node is dialable (can be connected to) by other peers
	 * @param [callback] - Optional callback to execute when node becomes dialable
	 * @returns True if the node is dialable
	 */
	isDialable(callback?: () => void | Promise<void>): Promise<boolean>;

	/**
	 * Updates the score parameters for a specific topic
	 * @param topic - The topic to update score parameters for
	 * @param params - New score parameters to apply
	 */
	changeTopicScoreParams(topic: string, params: TopicScoreParams): void;

	/**
	 * Removes the score parameters for a specific topic
	 * @param topic - The topic to remove score parameters from
	 */
	removeTopicScoreParams(topic: string): void;

	/**
	 * Subscribes to a topic to receive messages published to it
	 * @param topic - The topic to subscribe to
	 * @throws {Error} If the node is not initialized
	 */
	subscribe(topic: string): void;

	/**
	 * Unsubscribes from a topic to stop receiving messages from it
	 * @param topic - The topic to unsubscribe from
	 * @throws {Error} If the node is not initialized
	 */
	unsubscribe(topic: string): void;

	/**
	 * Connects to the bootstrap nodes
	 * @returns Resolves when connection is established
	 */
	connectToBootstraps(): Promise<void>;

	/**
	 * Connects to one or more peer addresses
	 * @param addr - The address(es) to connect to
	 * @returns Resolves when connection is established
	 */
	connect(addr: MultiaddrInput | MultiaddrInput[]): Promise<void>;

	/**
	 * Disconnects from a peer
	 * @param peerId - The ID of the peer to disconnect from
	 * @returns Resolves when disconnection is complete
	 */
	disconnect(peerId: string): Promise<void>;

	/**
	 * Gets the multiaddresses for a specific peer
	 * @param peerId - The ID of the peer
	 * @returns Array of peer's multiaddresses
	 */
	getPeerMultiaddrs(peerId: PeerId | string): Promise<Address[]>;

	/**
	 * Gets the list of bootstrap nodes
	 * @returns Array of bootstrap node addresses
	 */
	getBootstrapNodes(): string[];

	/**
	 * Get all topics this node is subscribed to
	 * @returns Array of topics
	 */
	getSubscribedTopics(): string[];

	/**
	 * Gets the multiaddresses this node is listening on
	 * @returns Array of multiaddresses or undefined if not started
	 */
	getMultiaddrs(): string[] | undefined;

	/**
	 * Gets all peers currently connected to this node
	 * @returns Array of peer IDs
	 */
	getAllPeers(): string[];

	/**
	 * Gets all peers subscribed to a specific group/topic
	 * @param group - The group/topic to get peers for
	 * @returns Array of peer IDs subscribed to the group
	 */
	getGroupPeers(group: string): string[];

	/**
	 * Broadcasts a message to all peers subscribed to a topic
	 * @param topic - The topic to broadcast to
	 * @param message - The message to broadcast
	 * @returns Resolves when the message has been broadcast
	 */
	broadcastMessage(topic: string, message: Message): Promise<void>;

	/**
	 * Sends a message to a specific peer
	 * @param peerId - The ID of the peer to send to
	 * @param message - The message to send
	 * @returns Resolves when the message has been sent
	 */
	sendMessage(peerId: string, message: Message): Promise<void>;

	/**
	 * Sends a message to a random peer in a group
	 * @param group - The group to select a random peer from
	 * @param message - The message to send
	 * @returns Resolves when the message has been sent
	 * @throws {Error} If the group has no peers
	 */
	sendGroupMessageRandomPeer(group: string, message: Message): Promise<void>;

	/**
	 * Subscribes to the message queue
	 * @param handler - The handler to subscribe to the message queue
	 */
	subscribeToMessageQueue(handler: IMessageQueueHandler<Message>): void;
}
