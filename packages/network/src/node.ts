import { type GossipSub, type GossipsubMessage, gossipsub } from "@chainsafe/libp2p-gossipsub";
import {
	type TopicScoreParams,
	createPeerScoreParams,
	createTopicScoreParams,
} from "@chainsafe/libp2p-gossipsub/score";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { autoNAT } from "@libp2p/autonat";
import { type BootstrapComponents, bootstrap } from "@libp2p/bootstrap";
import { circuitRelayServer, circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { privateKeyFromRaw } from "@libp2p/crypto/keys";
import { dcutr } from "@libp2p/dcutr";
import { devToolsMetrics } from "@libp2p/devtools-metrics";
import { identify, identifyPush } from "@libp2p/identify";
import type {
	Address,
	EventCallback,
	PeerDiscovery,
	Stream,
	StreamHandler,
} from "@libp2p/interface";
import { ping } from "@libp2p/ping";
import {
	type PubSubPeerDiscoveryComponents,
	pubsubPeerDiscovery,
} from "@libp2p/pubsub-peer-discovery";
import { webRTC } from "@libp2p/webrtc";
import { webSockets } from "@libp2p/websockets";
import * as filters from "@libp2p/websockets/filters";
import { type MultiaddrInput, multiaddr } from "@multiformats/multiaddr";
import { WebRTC } from "@multiformats/multiaddr-matcher";
import { Logger } from "@ts-drp/logger";
import { Message, type LoggerOptions } from "@ts-drp/types";
import { type Libp2p, type ServiceFactoryMap, createLibp2p } from "libp2p";

import { uint8ArrayToStream } from "./stream.js";

export * from "./stream.js";

export const DRP_MESSAGE_PROTOCOL = "/drp/message/0.0.1";
export const BOOTSTRAP_NODES = [
	"/dns4/bootstrap1.topology.gg/tcp/443/wss/p2p/16Uiu2HAm4MeUv712cWmXpvGEZ1r1741YoWvsCcmptCza43b7opdK",
	"/dns4/bootstrap2.topology.gg/tcp/443/wss/p2p/16Uiu2HAmGjAVQyzgTCumpB9TuojKT4LZTBC5HRiZyuwGG9VHodLC",
];
let log: Logger;

// snake_casing to match the JSON config
export interface DRPNetworkNodeConfig {
	announce_addresses?: string[];
	bootstrap?: boolean;
	bootstrap_peers?: string[];
	browser_metrics?: boolean;
	listen_addresses?: string[];
	log_config?: LoggerOptions;
	pubsub?: {
		peer_discovery_interval?: number;
	};
}

type PeerDiscoveryFunction =
	| ((components: PubSubPeerDiscoveryComponents) => PeerDiscovery)
	| ((components: BootstrapComponents) => PeerDiscovery);

export class DRPNetworkNode {
	private _config?: DRPNetworkNodeConfig;
	private _node?: Libp2p;
	private _pubsub?: GossipSub;

	peerId = "";

	constructor(config?: DRPNetworkNodeConfig) {
		this._config = config;
		log = new Logger("drp::network", config?.log_config);
	}

	async start(rawPrivateKey?: Uint8Array): Promise<void> {
		if (this._node?.status === "started") throw new Error("Node already started");

		let privateKey = undefined;
		if (rawPrivateKey) {
			privateKey = privateKeyFromRaw(rawPrivateKey);
		}

		const _bootstrapNodesList = this._config?.bootstrap_peers
			? this._config.bootstrap_peers
			: BOOTSTRAP_NODES;

		const _peerDiscovery: Array<PeerDiscoveryFunction> = [
			pubsubPeerDiscovery({
				topics: ["drp::discovery"],
				interval: this._config?.pubsub?.peer_discovery_interval || 5000,
			}),
		];

		const _bootstrapPeerID: string[] = [];
		if (_bootstrapNodesList.length) {
			_peerDiscovery.push(
				bootstrap({
					list: _bootstrapNodesList,
				})
			);
			for (const addr of _bootstrapNodesList) {
				const peerId = multiaddr(addr).getPeerId();
				if (!peerId) continue;
				_bootstrapPeerID.push(peerId);
			}
		}

		let _node_services: ServiceFactoryMap = {
			ping: ping(),
			dcutr: dcutr(),
			identify: identify(),
			identifyPush: identifyPush(),
			pubsub: gossipsub({
				doPX: true,
				allowPublishToZeroTopicPeers: true,
				scoreParams: createPeerScoreParams({
					IPColocationFactorWeight: 0,
					appSpecificScore: (peerId: string) => {
						if (_bootstrapNodesList.some((node) => node.includes(peerId))) {
							return 1000;
						}
						return 0;
					},
					topics: {
						"drp::discovery": createTopicScoreParams({
							topicWeight: 1,
						}),
					},
				}),
				fallbackToFloodsub: false,
			}),
		};

		if (this._config?.bootstrap) {
			_node_services = {
				..._node_services,
				autonat: autoNAT(),
				pubsub: gossipsub({
					// cf: https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md#recommendations-for-network-operators
					D: 0,
					Dlo: 0,
					Dhi: 0,
					Dout: 0,
					doPX: true,
					ignoreDuplicatePublishError: true,
					allowPublishToZeroTopicPeers: true,
					scoreParams: createPeerScoreParams({
						topicScoreCap: 50,
						IPColocationFactorWeight: 0,
					}),
					fallbackToFloodsub: false,
				}),
			};
		}

		const _bootstrap_services = {
			..._node_services,
			relay: circuitRelayServer({
				reservations: {
					maxReservations: Number.POSITIVE_INFINITY,
				},
			}),
		};

		this._node = await createLibp2p({
			privateKey,
			addresses: {
				listen: this._config?.listen_addresses
					? this._config.listen_addresses
					: ["/p2p-circuit", "/webrtc"],
				...(this._config?.announce_addresses ? { announce: this._config.announce_addresses } : {}),
			},
			connectionManager: {
				dialTimeout: 60_000,
				addressSorter: this._sortAddresses,
			},
			connectionEncrypters: [noise()],
			connectionGater: {
				denyDialMultiaddr: () => {
					return false;
				},
			},
			metrics: this._config?.browser_metrics ? devToolsMetrics() : undefined,
			peerDiscovery: _peerDiscovery,
			services: this._config?.bootstrap ? _bootstrap_services : _node_services,
			streamMuxers: [yamux()],
			transports: [
				circuitRelayTransport(),
				webRTC(),
				webSockets({
					filter: filters.all,
				}),
			],
		});
		log.info(
			"::start: running on:",
			this._node.getMultiaddrs().map((addr) => addr.toString())
		);

		if (!this._config?.bootstrap) {
			for (const addr of this._config?.bootstrap_peers || []) {
				try {
					await this._node.dial(multiaddr(addr));
				} catch (e) {
					log.error("::start::dial::error", e);
				}
			}
		}

		this._pubsub = this._node.services.pubsub as GossipSub;
		this.peerId = this._node.peerId.toString();

		log.info("::start: Successfuly started DRP network w/ peer_id", this.peerId);

		this._node.addEventListener("peer:connect", (e) =>
			log.info("::start::peer::connect", e.detail)
		);

		this._node.addEventListener("peer:discovery", (e) =>
			log.info("::start::peer::discovery", e.detail)
		);

		this._node.addEventListener("peer:identify", (e) =>
			log.info("::start::peer::identify", e.detail)
		);

		this._pubsub.addEventListener("gossipsub:graft", (e) =>
			log.info("::start::gossipsub::graft", e.detail)
		);

		// needded as I've disabled the pubsubPeerDiscovery
		this._pubsub?.subscribe("drp::discovery");
	}

	async stop(): Promise<void> {
		if (this._node?.status === "stopped") throw new Error("Node not started");
		await this._node?.stop();
	}

	async restart(config?: DRPNetworkNodeConfig, rawPrivateKey?: Uint8Array): Promise<void> {
		await this.stop();
		if (config) this._config = config;
		await this.start(rawPrivateKey);
	}

	async isDialable(callback?: () => void | Promise<void>): Promise<boolean> {
		let dialable = await this._node?.isDialable(this._node.getMultiaddrs());
		if (dialable && callback) {
			await callback();
			return true;
		}
		if (!callback) return false;

		const checkDialable = async (): Promise<void> => {
			dialable = await this._node?.isDialable(this._node.getMultiaddrs());
			if (dialable) {
				await callback();
			}
		};

		this._node?.addEventListener("transport:listening", () => void checkDialable());
		return false;
	}

	private _sortAddresses(a: Address, b: Address): 0 | 1 | -1 {
		const localRegex =
			/(^\/ip4\/127\.)|(^\/ip4\/10\.)|(^\/ip4\/172\.1[6-9]\.)|(^\/ip4\/172\.2[0-9]\.)|(^\/ip4\/172\.3[0-1]\.)|(^\/ip4\/192\.168\.)/;
		const aLocal = localRegex.test(a.toString());
		const bLocal = localRegex.test(b.toString());
		const aWebrtc = WebRTC.matches(a.multiaddr);
		const bWebrtc = WebRTC.matches(b.multiaddr);
		if (aLocal && !bLocal) return 1;
		if (!aLocal && bLocal) return -1;
		if (aWebrtc && !bWebrtc) return -1;
		if (!aWebrtc && bWebrtc) return 1;
		return 0;
	}

	changeTopicScoreParams(topic: string, params: TopicScoreParams): void {
		if (!this._pubsub) return;
		this._pubsub.score.params.topics[topic] = params;
	}

	removeTopicScoreParams(topic: string): void {
		if (!this._pubsub) return;
		delete this._pubsub.score.params.topics[topic];
	}

	subscribe(topic: string): void {
		if (!this._node) {
			log.error("::subscribe: Node not initialized, please run .start()");
			return;
		}

		try {
			this._pubsub?.subscribe(topic);
			this._pubsub?.getPeers();
			log.info("::subscribe: Successfuly subscribed the topic", topic);
		} catch (e) {
			log.error("::subscribe:", e);
		}
	}

	unsubscribe(topic: string): void {
		if (!this._node) {
			log.error("::unsubscribe: Node not initialized, please run .start()");
			return;
		}

		try {
			this._pubsub?.unsubscribe(topic);
			log.info("::unsubscribe: Successfuly unsubscribed the topic", topic);
		} catch (e) {
			log.error("::unsubscribe:", e);
		}
	}

	async connect(addr: MultiaddrInput): Promise<void> {
		try {
			await this._node?.dial([multiaddr(addr)]);
			log.info("::connect: Successfuly dialed", addr);
		} catch (e) {
			log.error("::connect:", e);
		}
	}

	async disconnect(peerId: string): Promise<void> {
		try {
			await this._node?.hangUp(multiaddr(`/p2p/${peerId}`));
			log.info("::disconnect: Successfuly disconnected", peerId);
		} catch (e) {
			log.error("::disconnect:", e);
		}
	}

	getBootstrapNodes(): string[] {
		return this._config?.bootstrap_peers ?? BOOTSTRAP_NODES;
	}

	getMultiaddrs(): string[] {
		return this._node?.getMultiaddrs().map((addr) => addr.toString()) ?? [];
	}

	getAllPeers(): string[] {
		const peers = this._node?.getPeers();
		if (!peers) return [];
		return peers.map((peer) => peer.toString());
	}

	getGroupPeers(group: string): string[] {
		const peers = this._pubsub?.getSubscribers(group);
		if (!peers) return [];
		return peers.map((peer) => peer.toString());
	}

	async broadcastMessage(topic: string, message: Message): Promise<void> {
		try {
			const messageBuffer = Message.encode(message).finish();
			await this._pubsub?.publish(topic, messageBuffer);

			log.info("::broadcastMessage: Successfuly broadcasted message to topic", topic);
		} catch (e) {
			log.error("::broadcastMessage:", e);
		}
	}

	async sendMessage(peerId: string, message: Message): Promise<void> {
		try {
			const connection = await this._node?.dial([multiaddr(`/p2p/${peerId}`)]);
			const stream = <Stream>await connection?.newStream(DRP_MESSAGE_PROTOCOL);
			const messageBuffer = Message.encode(message).finish();
			await uint8ArrayToStream(stream, messageBuffer);
		} catch (e) {
			log.error("::sendMessage:", e);
		}
	}

	async sendGroupMessageRandomPeer(group: string, message: Message): Promise<void> {
		try {
			const peers = this._pubsub?.getSubscribers(group);
			if (!peers || peers.length === 0) throw Error("Topic wo/ peers");
			const peerId = peers[Math.floor(Math.random() * peers.length)];

			const connection = await this._node?.dial(peerId);
			const stream: Stream = (await connection?.newStream(DRP_MESSAGE_PROTOCOL)) as Stream;
			const messageBuffer = Message.encode(message).finish();
			await uint8ArrayToStream(stream, messageBuffer);
		} catch (e) {
			log.error("::sendGroupMessageRandomPeer:", e);
		}
	}

	addGroupMessageHandler(
		group: string,
		handler: EventCallback<CustomEvent<GossipsubMessage>>
	): void {
		this._pubsub?.addEventListener("gossipsub:message", (e) => {
			if (group && e.detail.msg.topic !== group) return;
			handler(e);
		});
	}

	async addMessageHandler(handler: StreamHandler): Promise<void> {
		await this._node?.handle(DRP_MESSAGE_PROTOCOL, handler);
	}

	async addCustomMessageHandler(
		protocol: string | string[],
		handler: StreamHandler
	): Promise<void> {
		await this._node?.handle(protocol, handler);
	}
}
