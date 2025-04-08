import {
	ActionType,
	type DrpType,
	type IACL,
	type IDRP,
	type ResolveConflictsType,
	SemanticsType,
	type Vertex,
} from "@ts-drp/types";
import { describe, expect, it } from "vitest";

import { type PostOperation } from "../src/operation.js";
import { createPipeline } from "../src/pipeline/pipeline.js";
import { DRPProxy, type DRPProxyChainArgs } from "../src/proxy.js";

describe("DRPProxy", () => {
	// Mock types and interfaces
	interface MockDRP extends IDRP {
		testMethod(arg: string): string;
		query_something(): void;
		resolveConflicts(vertices: Vertex[]): ResolveConflictsType;
	}

	const mockVertex: Vertex = {
		hash: "test-hash",
		peerId: "test-peer",
		operation: {
			drpType: "DRP",
			opType: "test",
			value: [],
		},
		dependencies: [],
		timestamp: 0,
		signature: new Uint8Array(),
	};

	const mockACL: IACL = {
		id: "test-acl",
		type: "acl",
		data: {},
		semanticsType: SemanticsType.pair,
		permissionless: false,
		grant: () => {},
		revoke: () => {},
		setKey: () => {},
		query_hasPermission: () => false,
		query_getPermissions: () => [],
		query_getKeys: () => [],
		query_getKey: () => undefined,
		query_getFinalitySigners: () => new Map(),
		query_isAdmin: () => false,
		query_isFinalitySigner: () => false,
		query_isWriter: () => false,
		query_getPeerKey: () => undefined,
		resolveConflicts: (_vertices: Vertex[]): ResolveConflictsType => ({ action: ActionType.Nop }),
	};

	const mockDRP: MockDRP = {
		id: "test-drp",
		type: "drp",
		data: {},
		semanticsType: SemanticsType.pair,
		testMethod: (arg: string) => `test-${arg}`,
		query_something: () => {},
		resolveConflicts: (_vertices: Vertex[]): ResolveConflictsType => ({ action: ActionType.Nop }),
	};

	const mockPipeline = createPipeline<DRPProxyChainArgs, PostOperation<IDRP>>(({ prop, args }) => ({
		stop: false,
		result: {
			isACL: false,
			vertex: mockVertex,
			lcaResult: { lca: "test-lca", linearizedVertices: [] },
			drpVertices: [mockVertex],
			aclVertices: [mockVertex],
			acl: mockACL,
			drp: mockDRP,
			result: `processed-${prop}-${args[0]}`,
		},
	}));

	it("should create a proxy instance", () => {
		const proxy = new DRPProxy(mockDRP, mockPipeline, "drp" as DrpType);
		expect(proxy).toBeDefined();
		expect(proxy.proxy).toBeDefined();
	});

	it("should intercept method calls and process them through pipeline", () => {
		const proxy = new DRPProxy(mockDRP, mockPipeline, "drp" as DrpType);
		const result = proxy.proxy.testMethod("value");

		expect(result).toBe("processed-testMethod-value");
	});

	it("should not intercept query methods", () => {
		const proxy = new DRPProxy(mockDRP, mockPipeline, "drp" as DrpType);
		const originalQueryMethod = mockDRP.query_something;

		expect(proxy.proxy.query_something).toBe(originalQueryMethod);
	});

	it("should not intercept resolveConflicts method", () => {
		const proxy = new DRPProxy(mockDRP, mockPipeline, "drp" as DrpType);
		const originalResolveMethod = mockDRP.resolveConflicts;

		expect(proxy.proxy.resolveConflicts).toBe(originalResolveMethod);
	});

	it("should pass through non-function properties", () => {
		const proxy = new DRPProxy(mockDRP, mockPipeline, "drp" as DrpType);

		expect(proxy.proxy.id).toBe(mockDRP.id);
		expect(proxy.proxy.type).toBe(mockDRP.type);
		expect(proxy.proxy.data).toBe(mockDRP.data);
		expect(proxy.proxy.semanticsType).toBe(mockDRP.semanticsType);
	});

	it("should handle pipeline errors gracefully", () => {
		const errorPipeline = createPipeline<DRPProxyChainArgs, PostOperation<IDRP>>(() => {
			throw new Error("Pipeline error");
		});

		const proxy = new DRPProxy(mockDRP, errorPipeline, "drp" as DrpType);

		expect(() => proxy.proxy.testMethod("value")).toThrow("Pipeline error");
	});
});
