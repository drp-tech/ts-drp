import { type GossipsubMessage } from "@chainsafe/libp2p-gossipsub";
import { type TopicScoreParams } from "@chainsafe/libp2p-gossipsub/score";
import {
	type Address,
	type EventCallback,
	type PeerId,
	type StreamHandler,
} from "@libp2p/interface";
import { type MultiaddrInput } from "@multiformats/multiaddr";

import { type LoggerOptions } from "./logger.js";
import { type Message } from "./proto/drp/v1/messages_pb.js";

/**
 * Configuration interface for DRP Network Node
 * @interface DRPNetworkNodeConfig
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
	};
}

/**
 * Interface for DRP Network Node
 */
export interface DRPNetworkNode {
	/**
	 * The unique identifier of this node in the network
	 * @readonly
	 */
	peerId: string;

	/**
	 * Starts the network node and begins listening for connections
	 * @param {Uint8Array} [rawPrivateKey] - Optional raw private key for node identity
	 * @returns {Promise<void>} Resolves when the node has started
	 * @throws {Error} If the node is already started
	 */
	start(rawPrivateKey?: Uint8Array): Promise<void>;

	/**
	 * Stops the network node and closes all connections
	 * @returns {Promise<void>} Resolves when the node has stopped
	 * @throws {Error} If the node is not started
	 */
	stop(): Promise<void>;

	/**
	 * Restarts the network node with optional new configuration
	 * @param {DRPNetworkNodeConfig} [config] - New configuration to apply
	 * @param {Uint8Array} [rawPrivateKey] - New raw private key for node identity
	 * @returns {Promise<void>} Resolves when the node has restarted
	 */
	restart(config?: DRPNetworkNodeConfig, rawPrivateKey?: Uint8Array): Promise<void>;

	/**
	 * Checks if the node is dialable (can be connected to) by other peers
	 * @param {() => void | Promise<void>} [callback] - Optional callback to execute when node becomes dialable
	 * @returns {Promise<boolean>} True if the node is dialable
	 */
	isDialable(callback?: () => void | Promise<void>): Promise<boolean>;

	/**
	 * Updates the score parameters for a specific topic
	 * @param {string} topic - The topic to update score parameters for
	 * @param {TopicScoreParams} params - New score parameters to apply
	 */
	changeTopicScoreParams(topic: string, params: TopicScoreParams): void;

	/**
	 * Removes the score parameters for a specific topic
	 * @param {string} topic - The topic to remove score parameters from
	 */
	removeTopicScoreParams(topic: string): void;

	/**
	 * Subscribes to a topic to receive messages published to it
	 * @param {string} topic - The topic to subscribe to
	 * @throws {Error} If the node is not initialized
	 */
	subscribe(topic: string): void;

	/**
	 * Unsubscribes from a topic to stop receiving messages from it
	 * @param {string} topic - The topic to unsubscribe from
	 * @throws {Error} If the node is not initialized
	 */
	unsubscribe(topic: string): void;

	/**
	 * Connects to the bootstrap nodes
	 * @returns {Promise<void>} Resolves when connection is established
	 */
	connectToBootstraps(): Promise<void>;

	/**
	 * Connects to one or more peer addresses
	 * @param {MultiaddrInput | MultiaddrInput[]} addr - The address(es) to connect to
	 * @returns {Promise<void>} Resolves when connection is established
	 */
	connect(addr: MultiaddrInput | MultiaddrInput[]): Promise<void>;

	/**
	 * Disconnects from a peer
	 * @param {string} peerId - The ID of the peer to disconnect from
	 * @returns {Promise<void>} Resolves when disconnection is complete
	 */
	disconnect(peerId: string): Promise<void>;

	/**
	 * Gets the multiaddresses for a specific peer
	 * @param {PeerId | string} peerId - The ID of the peer
	 * @returns {Promise<Address[]>} Array of peer's multiaddresses
	 */
	getPeerMultiaddrs(peerId: PeerId | string): Promise<Address[]>;

	/**
	 * Gets the list of bootstrap nodes
	 * @returns {string[]} Array of bootstrap node addresses
	 */
	getBootstrapNodes(): string[];

	/**
	 * Get all topics this node is subscribed to
	 * @returns {string[]} Array of topics
	 */
	getSubscribedTopics(): string[];

	/**
	 * Gets the multiaddresses this node is listening on
	 * @returns {string[] | undefined} Array of multiaddresses or undefined if not started
	 */
	getMultiaddrs(): string[] | undefined;

	/**
	 * Gets all peers currently connected to this node
	 * @returns {string[]} Array of peer IDs
	 */
	getAllPeers(): string[];

	/**
	 * Gets all peers subscribed to a specific group/topic
	 * @param {string} group - The group/topic to get peers for
	 * @returns {string[]} Array of peer IDs subscribed to the group
	 */
	getGroupPeers(group: string): string[];

	/**
	 * Broadcasts a message to all peers subscribed to a topic
	 * @param {string} topic - The topic to broadcast to
	 * @param {Message} message - The message to broadcast
	 * @returns {Promise<void>} Resolves when the message has been broadcast
	 */
	broadcastMessage(topic: string, message: Message): Promise<void>;

	/**
	 * Sends a message to a specific peer
	 * @param {string} peerId - The ID of the peer to send to
	 * @param {Message} message - The message to send
	 * @returns {Promise<void>} Resolves when the message has been sent
	 */
	sendMessage(peerId: string, message: Message): Promise<void>;

	/**
	 * Sends a message to a random peer in a group
	 * @param {string} group - The group to select a random peer from
	 * @param {Message} message - The message to send
	 * @returns {Promise<void>} Resolves when the message has been sent
	 * @throws {Error} If the group has no peers
	 */
	sendGroupMessageRandomPeer(group: string, message: Message): Promise<void>;

	/**
	 * Adds a message handler for a specific group
	 * @param {string} group - The group to handle messages for
	 * @param {EventCallback<CustomEvent<GossipsubMessage>>} handler - The message handler function
	 */
	addGroupMessageHandler(
		group: string,
		handler: EventCallback<CustomEvent<GossipsubMessage>>
	): void;

	/**
	 * Adds a general message handler for all messages
	 * @param {StreamHandler} handler - The message handler function
	 * @returns {Promise<void>} Resolves when the handler is added
	 */
	addMessageHandler(handler: StreamHandler): Promise<void>;

	/**
	 * Adds a custom protocol message handler
	 * @param {string | string[]} protocol - The protocol(s) to handle messages for
	 * @param {StreamHandler} handler - The message handler function
	 * @returns {Promise<void>} Resolves when the handler is added
	 */
	addCustomMessageHandler(protocol: string | string[], handler: StreamHandler): Promise<void>;
}
