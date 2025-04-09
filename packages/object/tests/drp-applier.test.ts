import { DrpType, type IACL, type IDRP, Operation, SemanticsType, Vertex } from "@ts-drp/types";
import { computeHash } from "@ts-drp/utils/hash";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createACL } from "../src/acl/index.js";
import { DRPVertexApplier } from "../src/drp-applier.js";
import { FinalityStore } from "../src/finality/index.js";
import { HashGraph } from "../src/hashgraph/index.js";
import { DRPObjectStateManager } from "../src/state.js";

class MockDRP implements IDRP {
	semanticsType = SemanticsType.pair;

	test(): string {
		return "test";
	}
}

function createMockDRP(): IDRP {
	return new MockDRP();
}

describe("DRPVertexApplier", () => {
	const peerId = "test-peer";
	let applier: DRPVertexApplier<IDRP>;
	let mockDRP: IDRP;
	let mockACL: IACL;
	let mockHashGraph: HashGraph;
	let mockStates: DRPObjectStateManager<IDRP>;
	let mockFinalityStore: FinalityStore;
	let mockNotify: (origin: string, vertices: Vertex[]) => void;

	beforeEach(() => {
		mockACL = createACL({ admins: [peerId] });
		mockDRP = createMockDRP();
		mockHashGraph = new HashGraph("test-peer", undefined, undefined, undefined);
		mockStates = new DRPObjectStateManager(mockACL, mockDRP);
		mockFinalityStore = new FinalityStore();
		mockNotify = vi.fn();

		applier = new DRPVertexApplier({
			drp: mockDRP,
			acl: mockACL,
			hashGraph: mockHashGraph,
			states: mockStates,
			finalityStore: mockFinalityStore,
			notify: mockNotify,
		});
	});

	describe("public methods", () => {
		describe("drp getter", () => {
			it("should return the DRP object", () => {
				for (const objectMember of Object.keys(mockDRP)) {
					const method = objectMember as keyof IDRP;
					const mockValue = mockDRP[method];
					const proxyValue = applier.drp?.[method];
					expect(proxyValue).toBe(mockValue);
				}
			});
		});

		describe("acl getter", () => {
			it("should return the ACL object", () => {
				for (const objectMember of Object.keys(mockACL)) {
					const method = objectMember as keyof IACL;
					const mockValue = mockACL[method];
					const proxyValue = applier.acl[method];
					expect(proxyValue).toBe(mockValue);
				}
			});
		});

		describe("applyVertices", () => {
			it("should apply valid vertices and return success", async () => {
				const peerId = "test-peer";
				const operation = Operation.create({ opType: "test", value: [], drpType: DrpType.DRP });
				const timestamp = Date.now();
				const hash = computeHash(peerId, operation, [HashGraph.rootHash], timestamp);
				const dependencies = [HashGraph.rootHash];
				const vertex = Vertex.create({ hash, peerId, dependencies, operation, timestamp });

				const result = await applier.applyVertices([vertex]);
				console.log(result);
				expect(result.applied).toBe(true);
				expect(result.missing).toHaveLength(0);
			});

			it("should handle missing vertices", async () => {
				const vertex = Vertex.create({
					hash: "test-hash",
					peerId: "test-peer",
					dependencies: [],
					operation: {
						drpType: DrpType.DRP,
						opType: "invalid",
						value: [],
					},
					timestamp: Date.now(),
					signature: new Uint8Array([1, 2, 3]),
				});

				const result = await applier.applyVertices([vertex]);
				expect(result.applied).toBe(false);
				expect(result.missing).toContain("test-hash");
			});
		});

		describe("applyFn", () => {
			it("should apply operation to DRP object", async () => {
				const peerId = "test-peer";
				const operation = Operation.create({ opType: "test", value: [], drpType: DrpType.DRP });
				const timestamp = Date.now();
				const hash = computeHash(peerId, operation, [HashGraph.rootHash], timestamp);
				const dependencies = [HashGraph.rootHash];
				const vertex = Vertex.create({ hash, peerId, dependencies, operation, timestamp });

				const result = await applier["applyFn"]({
					vertex,
					isACL: false,
					currentDRP: mockDRP,
					acl: mockACL,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBe(false);
				expect(result.result.result).toBe("test");
			});

			it("should apply operation to ACL object", async () => {
				const peerId = "test-peer";
				const operation = Operation.create({ opType: "query_isWriter", value: [peerId], drpType: DrpType.ACL });
				const timestamp = Date.now();
				const hash = computeHash(peerId, operation, [HashGraph.rootHash], timestamp);
				const dependencies = [HashGraph.rootHash];
				const vertex = Vertex.create({ hash, peerId, dependencies, operation, timestamp });

				vi.spyOn(mockACL, "query_isWriter").mockReturnValue(true);

				const result = await applier["applyFn"]({
					vertex,
					isACL: true,
					currentDRP: mockACL,
					acl: mockACL,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBe(false);
				expect(result.result.result).toBe(true);
			});

			it("should handle undefined operation", () => {
				const peerId = "test-peer";
				const operation = Operation.create({ opType: "test", value: [], drpType: DrpType.DRP });
				const timestamp = Date.now();
				const hash = computeHash(peerId, operation, [HashGraph.rootHash], timestamp);
				const dependencies = [HashGraph.rootHash];
				const vertex = Vertex.create({ hash, peerId, dependencies, operation, timestamp });
				vertex.operation = undefined;

				expect(() =>
					applier["applyFn"]({
						vertex,
						isACL: false,
						currentDRP: mockDRP,
						acl: mockACL,
						drpVertices: [],
						aclVertices: [],
						lcaResult: { lca: "test-lca", linearizedVertices: [] },
					})
				).toThrow("Operation is undefined");
			});

			it("should handle undefined currentDRP", async () => {
				const peerId = "test-peer";
				const operation = Operation.create({ opType: "test", value: [], drpType: DrpType.DRP });
				const timestamp = Date.now();
				const hash = computeHash(peerId, operation, [HashGraph.rootHash], timestamp);
				const dependencies = [HashGraph.rootHash];
				const vertex = Vertex.create({ hash, peerId, dependencies, operation, timestamp });

				const result = await applier["applyFn"]({
					vertex,
					isACL: false,
					currentDRP: undefined,
					acl: mockACL,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBe(false);
				expect(result.result.result).toBeUndefined();
			});

			it("should handle async operations", async () => {
				const peerId = "test-peer";
				const operation = Operation.create({ opType: "test", value: [], drpType: DrpType.DRP });
				const timestamp = Date.now();
				const hash = computeHash(peerId, operation, [HashGraph.rootHash], timestamp);
				const dependencies = [HashGraph.rootHash];
				const vertex = Vertex.create({ hash, peerId, dependencies, operation, timestamp });

				const asyncMockDRP = {
					...mockDRP,
					test: async (): Promise<string> => Promise.resolve("async-test"),
				};

				const result = await applier["applyFn"]({
					vertex,
					isACL: false,
					currentDRP: asyncMockDRP,
					acl: mockACL,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBe(false);
				expect(result.result.result).toBe("async-test");
			});
		});
	});

	describe("private methods", () => {
		describe("createVertex", () => {
			it("should create a vertex with correct properties", () => {
				const result = applier["createVertex"]({
					prop: "test",
					args: ["arg1"],
					type: DrpType.DRP,
				});

				expect(result.stop).toBe(false);
				expect(result.result.vertex.operation).toBeDefined();
				expect(result.result.vertex.operation?.opType).toBe("test");
				expect(result.result.vertex.operation?.value).toEqual(["arg1"]);
			});
		});

		describe("validateVertex", () => {
			it("should validate a correct vertex", () => {
				const peerId = "test-peer";
				const operation = Operation.create({ opType: "test", value: [], drpType: DrpType.DRP });
				const timestamp = Date.now();
				const hash = computeHash(peerId, operation, [HashGraph.rootHash], timestamp);
				const dependencies = [HashGraph.rootHash];
				const vertex = Vertex.create({ hash, peerId, dependencies, operation, timestamp });

				const result = applier["validateVertex"]({ vertex, isACL: false });
				expect(result.stop).toBe(false);
				expect(result.result.vertex).toBe(vertex);
			});
		});

		describe("getLCA", () => {
			it("should get LCA for vertex dependencies", () => {
				const peerId = "test-peer";
				const operation = Operation.create({ opType: "test", value: [], drpType: DrpType.DRP });
				const timestamp = Date.now();
				const hash = computeHash(peerId, operation, [HashGraph.rootHash], timestamp);
				const dependencies = [HashGraph.rootHash];
				const vertex = Vertex.create({ hash, peerId, dependencies, operation, timestamp });

				const result = applier["getLCA"]({ vertex, isACL: false });
				expect(result.stop).toBe(false);
				expect(result.result.lcaResult.lca).toBe(HashGraph.rootHash);
			});
		});

		describe("splitLCAOperation", () => {
			it("should split operations into DRP and ACL vertices", () => {
				const peerId = "test-peer";

				const operation = Operation.create({ opType: "test", value: [], drpType: DrpType.DRP });
				const timestamp = Date.now();
				const dependencies = [HashGraph.rootHash];
				const hash = computeHash(peerId, operation, dependencies, timestamp);
				const vertex = Vertex.create({ hash, peerId, dependencies, operation, timestamp });

				const operation2 = Operation.create({ opType: "test", value: [], drpType: DrpType.ACL });
				const timestamp2 = Date.now();
				const dependencies2 = [HashGraph.rootHash];
				const hash2 = computeHash(peerId, operation2, [HashGraph.rootHash], timestamp2);
				const vertex2 = Vertex.create({
					hash: hash2,
					peerId,
					dependencies: dependencies2,
					operation: operation2,
					timestamp: timestamp2,
				});

				const lcaResult = {
					lca: "test-lca",
					linearizedVertices: [vertex, vertex2],
				};

				const result = applier["splitLCAOperation"]({
					vertex,
					isACL: false,
					lcaResult,
				});
				console.log(result.result);
				expect(result.stop).toBe(false);
				expect(result.result.drpVertices).toHaveLength(1);
				expect(result.result.aclVertices).toHaveLength(1);
				expect(result.result.drpVertices[0]).toBe(vertex);
				expect(result.result.aclVertices[0]).toBe(vertex2);
			});
		});

		describe("validateWriterPermission", () => {
			it("should validate writer permissions", () => {
				const vertex = Vertex.create({
					hash: "test-hash",
					peerId: "test-peer",
					dependencies: [],
					operation: {
						drpType: DrpType.DRP,
						opType: "test",
						value: [],
					},
					timestamp: Date.now(),
					signature: new Uint8Array([1, 2, 3]),
				});

				vi.spyOn(mockACL, "query_isWriter").mockReturnValue(true);

				const result = applier["validateWriterPermission"]({
					vertex,
					isACL: false,
					acl: mockACL,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBe(false);
			});

			it("should throw error for non-writers", () => {
				const vertex = Vertex.create({
					hash: "test-hash",
					peerId: "test-peer",
					dependencies: [],
					operation: {
						drpType: DrpType.DRP,
						opType: "test",
						value: [],
					},
					timestamp: Date.now(),
					signature: new Uint8Array([1, 2, 3]),
				});

				vi.spyOn(mockACL, "query_isWriter").mockReturnValue(false);

				expect(() =>
					applier["validateWriterPermission"]({
						vertex,
						isACL: false,
						acl: mockACL,
						drpVertices: [],
						aclVertices: [],
						lcaResult: { lca: "test-lca", linearizedVertices: [] },
					})
				).toThrow("Not a writer");
			});
		});

		describe("equal", () => {
			it("should compare DRP states correctly", () => {
				const vertex = Vertex.create({
					hash: "test-hash",
					peerId: "test-peer",
					dependencies: [],
					operation: {
						drpType: DrpType.DRP,
						opType: "test",
						value: [],
					},
					timestamp: Date.now(),
					signature: new Uint8Array([1, 2, 3]),
				});

				const result = applier["equal"]({
					vertex,
					isACL: false,
					acl: mockACL,
					drp: mockDRP,
					currentDRP: mockDRP,
					result: undefined,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBeDefined();
			});
		});

		describe("assign", () => {
			it("should assign DRP state correctly", () => {
				const vertex = Vertex.create({
					hash: "test-hash",
					peerId: "test-peer",
					dependencies: [],
					operation: {
						drpType: DrpType.DRP,
						opType: "test",
						value: [],
					},
					timestamp: Date.now(),
					signature: new Uint8Array([1, 2, 3]),
				});

				const result = applier["assign"]({
					vertex,
					isACL: false,
					currentDRP: mockDRP,
					acl: mockACL,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBe(false);
			});
		});

		describe("assignState", () => {
			it("should assign state to store", () => {
				const vertex = Vertex.create({
					hash: "test-hash",
					peerId: "test-peer",
					dependencies: [],
					operation: {
						drpType: DrpType.DRP,
						opType: "test",
						value: [],
					},
					timestamp: Date.now(),
					signature: new Uint8Array([1, 2, 3]),
				});

				const result = applier["assignState"]({
					vertex,
					isACL: false,
					currentDRP: mockDRP,
					acl: mockACL,
					drp: mockDRP,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBe(false);
			});
		});

		describe("addVertexToHashGraph", () => {
			it("should add vertex to hashgraph", () => {
				const vertex = Vertex.create({
					hash: "test-hash",
					peerId: "test-peer",
					dependencies: [],
					operation: {
						drpType: DrpType.DRP,
						opType: "test",
						value: [],
					},
					timestamp: Date.now(),
					signature: new Uint8Array([1, 2, 3]),
				});

				const result = applier["addVertexToHashGraph"]({
					vertex,
					isACL: false,
					acl: mockACL,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBe(false);
				expect(mockHashGraph.vertices.has(vertex.hash)).toBe(true);
			});
		});

		describe("initializeFinalityStore", () => {
			it("should initialize finality store", () => {
				const vertex = Vertex.create({
					hash: "test-hash",
					peerId: "test-peer",
					dependencies: [],
					operation: {
						drpType: DrpType.DRP,
						opType: "test",
						value: [],
					},
					timestamp: Date.now(),
					signature: new Uint8Array([1, 2, 3]),
				});

				const finalitySigners = new Map<string, string>();
				finalitySigners.set("signer1", "signer1");
				vi.spyOn(mockACL, "query_getFinalitySigners").mockReturnValue(finalitySigners);

				const result = applier["initializeFinalityStore"]({
					vertex,
					isACL: false,
					acl: mockACL,
					currentDRP: mockDRP,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBe(false);
			});

			it("should initialize finality store with LCA operation", () => {
				const peerId = "test-peer";
				const operation = Operation.create({ opType: "setKey", value: ["key1", "value1"], drpType: DrpType.ACL });
				const timestamp = Date.now();
				const hash = computeHash(peerId, operation, [HashGraph.rootHash], timestamp);
				const dependencies = [HashGraph.rootHash];
				const vertex = Vertex.create({ hash, peerId, dependencies, operation, timestamp });

				const mockACL2 = createACL({ admins: [peerId] });
				const finalitySigners = new Map<string, string>();
				finalitySigners.set("signer2", "signer2");
				vi.spyOn(mockACL2, "query_getFinalitySigners").mockReturnValue(finalitySigners);

				const result = applier["initializeFinalityStore"]({
					vertex,
					isACL: true,
					acl: mockACL,
					currentDRP: mockACL2,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});
				console.log(result.result);

				expect(result.stop).toBe(false);

				applier["finalityStore"].states.get(hash)?.signerCredentials.forEach((signer) => {
					expect(signer).toBe("signer2");
				});
			});
		});

		describe("notify", () => {
			it("should call notify function", () => {
				const vertex = Vertex.create({
					hash: "test-hash",
					peerId: "test-peer",
					dependencies: [],
					operation: {
						drpType: DrpType.DRP,
						opType: "test",
						value: [],
					},
					timestamp: Date.now(),
					signature: new Uint8Array([1, 2, 3]),
				});

				const result = applier["notify"]({
					vertex,
					isACL: false,
					result: undefined,
					acl: mockACL,
					drpVertices: [],
					aclVertices: [],
					lcaResult: { lca: "test-lca", linearizedVertices: [] },
				});

				expect(result.stop).toBe(false);
				expect(mockNotify).toHaveBeenCalledWith("callFn", [vertex]);
			});
		});
	});
});
