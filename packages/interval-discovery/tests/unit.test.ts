import {
	DRPDiscovery,
	type DRPIntervalDiscoveryOptions,
	type DRPNetworkNode,
	IntervalRunnerState,
	Message,
	MessageType,
} from "@ts-drp/types";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createDRPDiscovery, DRPIntervalDiscovery } from "../src/index.js";

type MockedDRPNetworkNode = {
	[K in keyof DRPNetworkNode]: DRPNetworkNode[K] extends (...args: unknown[]) => unknown
		? ReturnType<typeof vi.fn>
		: DRPNetworkNode[K];
};

describe("DRPIntervalDiscovery Unit Tests", () => {
	let mockNetworkNode: MockedDRPNetworkNode;
	let discoveryInstance: DRPIntervalDiscovery;
	const mockSubscribedTopics: string[] = [];
	const testId = "test-discovery";

	beforeEach(() => {
		// Create mock network node
		mockNetworkNode = {
			peerId: { toString: () => "test-peer-id" },
			getGroupPeers: vi.fn().mockReturnValue([]),
			broadcastMessage: vi.fn(),
			connect: vi.fn(),
			sendMessage: vi.fn(),
			getPeerMultiaddrs: vi.fn(),
			getSubscribedTopics: vi.fn().mockReturnValue(mockSubscribedTopics),
		} as unknown as MockedDRPNetworkNode;

		// Create discovery instance with mocked dependencies
		const options: DRPIntervalDiscoveryOptions = {
			id: testId,
			networkNode: mockNetworkNode as unknown as DRPNetworkNode,
			interval: 1000,
			searchDuration: 5000,
			logConfig: { level: "silent" },
		};

		discoveryInstance = new DRPIntervalDiscovery(options);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Constructor", () => {
		test("should initialize with default search duration if not provided", () => {
			const instance = new DRPIntervalDiscovery({
				id: testId,
				networkNode: mockNetworkNode as unknown as DRPNetworkNode,
				interval: 1000,
				logConfig: { level: "silent" },
			});
			expect(instance.searchDuration).toBe(5 * 60 * 1000); // 5 minutes
		});

		test("should use provided search duration", () => {
			const customDuration = 10000;
			const instance = new DRPIntervalDiscovery({
				id: testId,
				networkNode: mockNetworkNode as unknown as DRPNetworkNode,
				interval: 1000,
				searchDuration: customDuration,
				logConfig: { level: "silent" },
			});
			expect(instance.searchDuration).toBe(customDuration);
		});

		test("should expose id from intervalRunner", () => {
			expect(discoveryInstance.id).toBe(testId);
		});
	});

	describe("State Management", () => {
		test("should start in stopped state", () => {
			expect(discoveryInstance.state).toBe(IntervalRunnerState.Stopped);
		});

		test("should change state to running when started", () => {
			discoveryInstance.start();
			expect(discoveryInstance.state).toBe(IntervalRunnerState.Running);
		});

		test("should change state to stopped when stopped", () => {
			discoveryInstance.start();
			discoveryInstance.stop();
			expect(discoveryInstance.state).toBe(IntervalRunnerState.Stopped);
		});
	});

	describe("Discovery Process", () => {
		test("should not broadcast discovery request if peers exist", async () => {
			(mockNetworkNode.getGroupPeers as ReturnType<typeof vi.fn>).mockReturnValue(["peer1"]);
			await discoveryInstance["_runDRPDiscovery"]();
			expect(mockNetworkNode.broadcastMessage).not.toHaveBeenCalled();
		});

		test("should broadcast discovery request if no peers exist", async () => {
			(mockNetworkNode.getGroupPeers as ReturnType<typeof vi.fn>).mockReturnValue([]);
			await discoveryInstance["_runDRPDiscovery"]();
			expect(mockNetworkNode.broadcastMessage).toHaveBeenCalled();
		});

		test("should handle discovery response correctly", async () => {
			const subscribers = {
				peer1: {
					multiaddrs: ["/ip4/127.0.0.1/tcp/1234/p2p/peer1"],
				},
			};

			await discoveryInstance.handleDiscoveryResponse("sender", subscribers);
			expect(mockNetworkNode.connect).toHaveBeenCalledWith(["/ip4/127.0.0.1/tcp/1234/p2p/peer1"]);
		});

		test("should handle error in discovery response", async () => {
			const subscribers = {
				peer1: {
					multiaddrs: ["/ip4/127.0.0.1/tcp/1234/p2p/peer1"],
				},
			};

			const error = new Error("Connection failed");
			(mockNetworkNode.connect as ReturnType<typeof vi.fn>).mockRejectedValue(error);

			await discoveryInstance.handleDiscoveryResponse("sender", subscribers);
			expect(mockNetworkNode.connect).toHaveBeenCalled();
		});

		test("should skip self in discovery response", async () => {
			const subscribers = {
				"test-peer-id": {
					// Same as mockNetworkNode.peerId
					multiaddrs: ["/ip4/127.0.0.1/tcp/1234/p2p/test-peer-id"],
				},
			};

			await discoveryInstance.handleDiscoveryResponse("sender", subscribers);
			expect(mockNetworkNode.connect).not.toHaveBeenCalled();
		});

		test("should handle broadcast error gracefully", async () => {
			(mockNetworkNode.broadcastMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Broadcast failed"));
			await discoveryInstance["_runDRPDiscovery"]();
			expect(mockNetworkNode.broadcastMessage).toHaveBeenCalled();
		});
	});

	describe("Static Handlers", () => {
		test("should handle discovery request correctly", async () => {
			const mockDataMessage = Message.create({
				sender: "sender",
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
				data: DRPDiscovery.encode(DRPDiscovery.create({})).finish(),
				objectId: "test-id",
			});

			(mockNetworkNode.getGroupPeers as ReturnType<typeof vi.fn>).mockReturnValue(["peer1"]);
			(mockNetworkNode.getPeerMultiaddrs as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ multiaddr: { toString: (): string => "/ip4/127.0.0.1/tcp/1234" } },
			]);

			await DRPIntervalDiscovery.handleDiscoveryRequest(
				"sender",
				mockDataMessage,
				mockNetworkNode as unknown as DRPNetworkNode
			);

			expect(mockNetworkNode.sendMessage).toHaveBeenCalled();
		});

		test("should not send response if no peers found", async () => {
			const mockDataMessage = Message.create({
				sender: "sender",
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
				data: DRPDiscovery.encode(DRPDiscovery.create({})).finish(),
				objectId: "test-id",
			});

			(mockNetworkNode.getGroupPeers as ReturnType<typeof vi.fn>).mockReturnValue([]);

			await DRPIntervalDiscovery.handleDiscoveryRequest(
				"sender",
				mockDataMessage,
				mockNetworkNode as unknown as DRPNetworkNode
			);

			expect(mockNetworkNode.sendMessage).not.toHaveBeenCalled();
		});

		test("should handle error in getPeerMultiaddrs gracefully", async () => {
			const mockDataMessage = Message.create({
				sender: "sender",
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
				data: DRPDiscovery.encode(DRPDiscovery.create({})).finish(),
				objectId: "test-id",
			});

			(mockNetworkNode.getGroupPeers as ReturnType<typeof vi.fn>).mockReturnValue(["peer1"]);
			(mockNetworkNode.getPeerMultiaddrs as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error("Failed to get multiaddrs")
			);

			await DRPIntervalDiscovery.handleDiscoveryRequest(
				"sender",
				mockDataMessage,
				mockNetworkNode as unknown as DRPNetworkNode
			);

			expect(mockNetworkNode.sendMessage).not.toHaveBeenCalled();
		});

		test("should handle error in sendMessage gracefully", async () => {
			const mockDataMessage = Message.create({
				sender: "sender",
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
				data: DRPDiscovery.encode(DRPDiscovery.create({})).finish(),
				objectId: "test-id",
			});

			(mockNetworkNode.getGroupPeers as ReturnType<typeof vi.fn>).mockReturnValue(["peer1"]);
			(mockNetworkNode.getPeerMultiaddrs as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ multiaddr: { toString: (): string => "/ip4/127.0.0.1/tcp/1234" } },
			]);
			(mockNetworkNode.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Failed to send message"));

			await DRPIntervalDiscovery.handleDiscoveryRequest(
				"sender",
				mockDataMessage,
				mockNetworkNode as unknown as DRPNetworkNode
			);

			expect(mockNetworkNode.sendMessage).toHaveBeenCalled();
		});

		test("should handle invalid discovery request data", async () => {
			const invalidDataMessage = Message.create({
				sender: "sender",
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
				data: new Uint8Array([1, 2, 3]), // Invalid protobuf data
				objectId: "test-id",
			});

			await DRPIntervalDiscovery.handleDiscoveryRequest(
				"sender",
				invalidDataMessage,
				mockNetworkNode as unknown as DRPNetworkNode
			);

			expect(mockNetworkNode.sendMessage).not.toHaveBeenCalled();
		});

		test("should include self in peers list if subscribed to topic", async () => {
			const discoveryRequest = DRPDiscovery.encode(DRPDiscovery.create()).finish();
			const mockData = Message.create({
				sender: "sender",
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
				data: discoveryRequest,
				objectId: "test-id",
			});
			const mockSubscribedTopics = ["test-id"];

			// Mock getSubscribedTopics to return our test topic
			(mockNetworkNode.getSubscribedTopics as ReturnType<typeof vi.fn>).mockReturnValue(mockSubscribedTopics);
			// Mock getGroupPeers to return empty list initially
			(mockNetworkNode.getGroupPeers as ReturnType<typeof vi.fn>).mockReturnValue([]);
			// Mock getPeerMultiaddrs to return valid multiaddr
			(mockNetworkNode.getPeerMultiaddrs as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ multiaddr: { toString: (): string => "/ip4/127.0.0.1/tcp/1234" } },
			]);

			await DRPIntervalDiscovery.handleDiscoveryRequest(
				"sender",
				mockData,
				mockNetworkNode as unknown as DRPNetworkNode
			);

			// Verify that sendMessage was called with a response containing our peer ID
			expect(mockNetworkNode.sendMessage).toHaveBeenCalledWith(
				"sender",
				expect.objectContaining({
					type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY_RESPONSE,
				})
			);
		});

		test("should not include self in peers list if not subscribed to topic", async () => {
			const discoveryRequest = DRPDiscovery.encode(DRPDiscovery.create()).finish();
			const mockData = Message.create({
				sender: "sender",
				type: MessageType.MESSAGE_TYPE_DRP_DISCOVERY,
				data: discoveryRequest,
				objectId: "test-id",
			});
			const mockSubscribedTopics = ["different-topic"];

			// Mock getSubscribedTopics to return a different topic
			(mockNetworkNode.getSubscribedTopics as ReturnType<typeof vi.fn>).mockReturnValue(mockSubscribedTopics);
			// Mock getGroupPeers to return empty list
			(mockNetworkNode.getGroupPeers as ReturnType<typeof vi.fn>).mockReturnValue([]);
			// Mock getPeerMultiaddrs to return valid multiaddr
			(mockNetworkNode.getPeerMultiaddrs as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ multiaddr: { toString: (): string => "/ip4/127.0.0.1/tcp/1234" } },
			]);

			await DRPIntervalDiscovery.handleDiscoveryRequest(
				"sender",
				mockData,
				mockNetworkNode as unknown as DRPNetworkNode
			);

			// Verify that sendMessage was not called since we have no peers
			expect(mockNetworkNode.sendMessage).not.toHaveBeenCalled();
		});
	});

	describe("Search Timeout", () => {
		test("should timeout search after duration exceeded", async () => {
			vi.useFakeTimers();
			(mockNetworkNode.getGroupPeers as ReturnType<typeof vi.fn>).mockReturnValue([]);

			// First discovery cycle starts the search
			await discoveryInstance["_runDRPDiscovery"]();
			expect(discoveryInstance["_searchStartTime"]).toBeDefined();

			// Advance time beyond search duration
			vi.advanceTimersByTime(6000); // More than the 5000ms search duration

			// Next discovery cycle should detect timeout
			await discoveryInstance["_runDRPDiscovery"]();
			expect(discoveryInstance["_searchStartTime"]).toBeUndefined();

			vi.useRealTimers();
		});

		test("should not timeout if search hasn't started", async () => {
			vi.useFakeTimers();
			(mockNetworkNode.getGroupPeers as ReturnType<typeof vi.fn>).mockReturnValue(["peer1"]);

			await discoveryInstance["_runDRPDiscovery"]();
			expect(discoveryInstance["_searchStartTime"]).toBeUndefined();

			vi.advanceTimersByTime(6000);
			await discoveryInstance["_runDRPDiscovery"]();
			expect(discoveryInstance["_searchStartTime"]).toBeUndefined();

			vi.useRealTimers();
		});
	});

	describe("Factory Function", () => {
		test("should create a new instance via factory function", () => {
			const instance = createDRPDiscovery({
				id: testId,
				networkNode: mockNetworkNode as unknown as DRPNetworkNode,
				interval: 1000,
				logConfig: { level: "silent" },
			});

			expect(instance).toBeInstanceOf(DRPIntervalDiscovery);
			expect(instance.id).toBe(testId);
		});
	});
});
