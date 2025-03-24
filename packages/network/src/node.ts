import { type GossipSub, gossipsub, type GossipsubOpts } from "@chainsafe/libp2p-gossipsub";
import {
	createPeerScoreParams,
	createTopicScoreParams,
	type PeerScoreParams,
	type TopicScoreParams,
} from "@chainsafe/libp2p-gossipsub/score";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { autoNAT } from "@libp2p/autonat";
import { bootstrap, type BootstrapComponents } from "@libp2p/bootstrap";
import { circuitRelayServer, circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { privateKeyFromRaw } from "@libp2p/crypto/keys";
import { dcutr } from "@libp2p/dcutr";
import { devToolsMetrics } from "@libp2p/devtools-metrics";
import { identify, identifyPush } from "@libp2p/identify";
import { type Address, type Connection, type PeerDiscovery, type PeerId, type Stream } from "@libp2p/interface";
import { peerIdFromString } from "@libp2p/peer-id";
import { ping } from "@libp2p/ping";
import { pubsubPeerDiscovery, type PubSubPeerDiscoveryComponents } from "@libp2p/pubsub-peer-discovery";
import { webRTC } from "@libp2p/webrtc";
import { webSockets } from "@libp2p/websockets";
import * as filters from "@libp2p/websockets/filters";
import { type Multiaddr, multiaddr, type MultiaddrInput } from "@multiformats/multiaddr";
import { WebRTC } from "@multiformats/multiaddr-matcher";
import { Logger } from "@ts-drp/logger";
import { MessageQueue } from "@ts-drp/message-queue";
import {
	DRP_DISCOVERY_TOPIC,
	DRP_INTERVAL_DISCOVERY_TOPIC,
	type DRPNetworkNodeConfig,
	type DRPNetworkNode as DRPNetworkNodeInterface,
	type IMessageQueueHandler,
	IntervalRunnerState,
	Message,
} from "@ts-drp/types";
import { createLibp2p, type Libp2p, type ServiceFactoryMap } from "libp2p";

import { PrometheusMetricsRegister } from "./metrics/prometheus.js";
import { streamToUint8Array, uint8ArrayToStream } from "./stream.js";

export * from "./stream.js";

export const DRP_MESSAGE_PROTOCOL = "/drp/message/0.0.1";
export const BOOTSTRAP_NODES = [
	"/dns4/bootstrap1.topology.gg/tcp/443/wss/p2p/16Uiu2HAm4MeUv712cWmXpvGEZ1r1741YoWvsCcmptCza43b7opdK",
	"/dns4/bootstrap2.topology.gg/tcp/443/wss/p2p/16Uiu2HAmGjAVQyzgTCumpB9TuojKT4LZTBC5HRiZyuwGG9VHodLC",
];
let log: Logger;

type PeerDiscoveryFunction =
	| ((components: PubSubPeerDiscoveryComponents) => PeerDiscovery)
	| ((components: BootstrapComponents) => PeerDiscovery);

export class DRPNetworkNode implements DRPNetworkNodeInterface {
	private _config?: DRPNetworkNodeConfig;
	private _node?: Libp2p;
	private _pubsub?: GossipSub;
	private _messageQueue: MessageQueue<Message>;
	private _metrics?: PrometheusMetricsRegister;
	private _bootstrapNodesList: string[];

	peerId = "";

	constructor(config?: DRPNetworkNodeConfig) {
		this._config = config;
		log = new Logger("drp::network", config?.log_config);
		this._messageQueue = new MessageQueue<Message>({ id: "network", logConfig: config?.log_config });
		this._bootstrapNodesList = this._config?.bootstrap_peers ? this._config.bootstrap_peers : BOOTSTRAP_NODES;
	}

	async start(rawPrivateKey?: Uint8Array): Promise<void> {
		if (this._node?.status === "started") throw new Error("Node already started");

		let privateKey = undefined;
		if (rawPrivateKey) {
			privateKey = privateKeyFromRaw(rawPrivateKey);
		}

		const _peerDiscovery: Array<PeerDiscoveryFunction> = [
			pubsubPeerDiscovery({
				topics: [DRP_DISCOVERY_TOPIC],
				interval: this._config?.pubsub?.peer_discovery_interval || 5000,
			}),
		];

		const _bootstrapPeerID: string[] = [];
		if (this._bootstrapNodesList.length) {
			_peerDiscovery.push(
				bootstrap({
					list: this._bootstrapNodesList,
				})
			);
			for (const addr of this._bootstrapNodesList) {
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
			pubsub: gossipsub(this.getGossipSubConfig(_bootstrapPeerID)),
		};

		if (this._config?.bootstrap) {
			_node_services = { ..._node_services, autonat: autoNAT() };
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
				listen: this._config?.listen_addresses ? this._config.listen_addresses : ["/p2p-circuit", "/webrtc"],
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
					await this.safeDial(multiaddr(addr));
				} catch (e) {
					log.error("::start::dial::error", e);
				}
			}
		}

		this._pubsub = this._node.services.pubsub as GossipSub;
		this.peerId = this._node.peerId.toString();

		log.info("::start: Successfuly started DRP network w/ peer_id", this.peerId);

		this._node.addEventListener("peer:connect", (e) => log.info("::start::peer::connect", e.detail));

		this._node.addEventListener("peer:discovery", (e) => log.info("::start::peer::discovery", e.detail));

		this._node.addEventListener("peer:identify", (e) => log.info("::start::peer::identify", e.detail));

		this._pubsub.addEventListener("gossipsub:graft", (e) => log.info("::start::gossipsub::graft", e.detail));

		// needed as I've disabled the pubsubPeerDiscovery
		this._pubsub?.subscribe(DRP_DISCOVERY_TOPIC);
		this._pubsub?.subscribe(DRP_INTERVAL_DISCOVERY_TOPIC);

		// start the routing loop to enqueue messages
		void this.startEnqueueMessages();
		this._metrics?.start(`drp-network-${this.peerId}`, 10_000);
		this._messageQueue.start();
	}

	async stop(): Promise<void> {
		if (this._node?.status === IntervalRunnerState.Stopped) throw new Error("Node not started");
		await this._node?.stop();
		this._messageQueue.close();
		this._metrics?.stop();
	}

	async restart(config?: DRPNetworkNodeConfig, rawPrivateKey?: Uint8Array): Promise<void> {
		await this.stop();
		this._metrics?.stop();
		if (config) this._config = config;
		await this.start(rawPrivateKey);
		this._metrics?.start(`drp-network-${this.peerId}`, 10_000);
	}

	async isDialable(callback?: () => void | Promise<void>): Promise<boolean> {
		let dialable = await this._node?.isDialable(this._node.getMultiaddrs());
		if (!callback) return dialable ?? false;
		if (dialable) {
			await callback();
			return true;
		}

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

	private getGossipSubConfig(bootstapNodeList: string[]): Partial<GossipsubOpts> {
		const baseConfig: Partial<GossipsubOpts> = {
			doPX: true,
			fallbackToFloodsub: false,
			allowPublishToZeroTopicPeers: true,
			scoreParams: this.getGossipSubPeerScoreParams(bootstapNodeList),
		};

		if (this._config?.bootstrap) {
			baseConfig.D = 0;
			baseConfig.Dlo = 0;
			baseConfig.Dhi = 0;
			baseConfig.Dout = 0;
		}

		if (this._config?.pubsub?.prometheus_metrics) {
			const pushgatewayUrl = this._config?.pubsub?.pushgateway_url ?? "http://localhost:9091";
			this._metrics = new PrometheusMetricsRegister(pushgatewayUrl);
			baseConfig.metricsRegister = this._metrics;
			baseConfig.metricsTopicStrToLabel = new Map();
		}

		return baseConfig;
	}

	private getGossipSubPeerScoreParams(bootstapNodeList: string[]): PeerScoreParams {
		if (this._config?.bootstrap) {
			return createPeerScoreParams({ topicScoreCap: 50, IPColocationFactorWeight: 0 });
		}

		return createPeerScoreParams({
			IPColocationFactorWeight: 0,
			appSpecificScore: (peerId: string) => {
				if (bootstapNodeList.some((node) => node.includes(peerId))) return 1000;

				return 0;
			},
			topics: { [DRP_DISCOVERY_TOPIC]: createTopicScoreParams({ topicWeight: 1 }) },
		});
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

	private addrsPerPeerId(peerIds: string[] | Multiaddr[]): Record<string, Multiaddr[]> {
		const addrs: Record<string, Multiaddr[]> = {};
		for (const peerId of peerIds) {
			const ma: Multiaddr = typeof peerId === "string" ? multiaddr(peerId) : peerId;
			const currentPeerId = ma.getPeerId()?.toString();
			if (!currentPeerId) continue;
			addrs[currentPeerId] = [...(addrs[currentPeerId] ?? []), ma];
		}
		return addrs;
	}

	/**
	 * @description Dial a peer with a peerId, multiaddr or array of multiaddrs it also handles the case where the caller
	 * do something bad like passing multiaddrs that as different PeerIds
	 *
	 * @param peerId - The peerId, multiaddr or array of multiaddrs to dial
	 * @returns The connection or undefined if no connection was made
	 */
	async safeDial(peerId: string[] | string | PeerId | Multiaddr | Multiaddr[]): Promise<Connection | undefined> {
		const isArray = Array.isArray(peerId);
		if (!isArray) {
			const addr =
				typeof peerId === "string" ? (peerId.includes("/") ? multiaddr(peerId) : peerIdFromString(peerId)) : peerId;
			return this._node?.dial(addr);
		}

		const addrsPerPeerId = this.addrsPerPeerId(peerId);
		return Promise.race(Object.values(addrsPerPeerId).map((addrs) => this._node?.dial(addrs)));
	}

	async connectToBootstraps(): Promise<void> {
		try {
			await this.safeDial(this._bootstrapNodesList);
			log.info("::connectToBootstraps: Successfully connected to bootstrap nodes");
		} catch (e) {
			log.error("::connectToBootstraps:", e);
		}
	}

	async connect(addr: MultiaddrInput | MultiaddrInput[]): Promise<void> {
		try {
			const multiaddrs = Array.isArray(addr) ? addr.map(multiaddr) : [multiaddr(addr)];
			await this.safeDial(multiaddrs);
			log.info("::connect: Successfully dialed", addr);
		} catch (e) {
			log.error("::connect:", e);
		}
	}

	async disconnect(peerId: string): Promise<void> {
		try {
			await this._node?.hangUp(multiaddr(`/p2p/${peerId}`));
			log.info("::disconnect: Successfully disconnected", peerId);
		} catch (e) {
			log.error("::disconnect:", e);
		}
	}

	async getPeerMultiaddrs(peerId: PeerId | string): Promise<Address[]> {
		const peerIdObj: PeerId = typeof peerId === "string" ? peerIdFromString(peerId) : peerId;

		const peer = await this._node?.peerStore.get(peerIdObj);
		if (!peer) return [];
		return peer.addresses;
	}

	getBootstrapNodes(): string[] {
		return this._bootstrapNodesList;
	}

	getSubscribedTopics(): string[] {
		return this._pubsub?.getTopics() ?? [];
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
			const connection = await this.safeDial([multiaddr(`/p2p/${peerId}`)]);
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

			const connection = await this.safeDial(peerId);
			const stream: Stream = (await connection?.newStream(DRP_MESSAGE_PROTOCOL)) as Stream;
			const messageBuffer = Message.encode(message).finish();
			await uint8ArrayToStream(stream, messageBuffer);
		} catch (e) {
			log.error("::sendGroupMessageRandomPeer:", e);
		}
	}

	private async startEnqueueMessages(): Promise<void> {
		this._pubsub?.addEventListener("gossipsub:message", (e) => {
			if (e.detail.msg.topic === DRP_DISCOVERY_TOPIC) return;
			this.handleGossipsubMessage(e.detail.msg.data);
		});
		await this._node?.handle(DRP_MESSAGE_PROTOCOL, ({ stream }) => void this.handleStream(stream));
	}

	private handleGossipsubMessage(data: Uint8Array): void {
		try {
			const message = Message.decode(data);
			this._messageQueue.enqueue(message).catch((e) => {
				log.error("::startEnqueueMessages::enqueue:", e);
			});
		} catch (e) {
			log.error(`::startEnqueueMessages::handleGossipsubMessage: msg.length=${data.length} error=${e}`);
		}
	}

	private async handleStream(stream: Stream): Promise<void> {
		const data = await streamToUint8Array(stream);
		const message = Message.decode(data);
		this._messageQueue.enqueue(message).catch((e) => {
			log.error("::startEnqueueMessages::enqueue:", e);
		});
	}

	subscribeToMessageQueue(handler: IMessageQueueHandler<Message>): void {
		this._messageQueue.subscribe(handler);
	}
}
