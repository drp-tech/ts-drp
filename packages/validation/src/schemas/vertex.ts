import { ACLConflictResolution } from "@ts-drp/types/dist/src/acl.js";
import { z } from "zod";

const aclOptionsSchema = z.object({
	admins: z
		.union([z.string(), z.array(z.string())])
		.optional()
		.default([]),
	permissionless: z.boolean().optional(),
	conflictResolution: z.nativeEnum(ACLConflictResolution).optional(),
});

const rootOperationValueSchema = z.object({
	drpArgs: z.array(z.unknown()).optional(),
	aclArgs: aclOptionsSchema,
});

const rootVertexOperationSchema = z.object({
	drpType: z.literal("DRP & ACL"),
	opType: z.literal("constructor"),
	value: rootOperationValueSchema,
});

const normalVertexOperationSchema = z.object({
	drpType: z.string(),
	opType: z.string(),
	value: z.any(),
});

const baseVertexSchema = z.object({
	hash: z.string(),
	peerId: z.string(),
	dependencies: z.array(z.string()),
	timestamp: z.number(),
	signature: z.instanceof(Uint8Array),
});

export const rootVertexSchema = baseVertexSchema.extend({
	operation: rootVertexOperationSchema,
});

export const normalVertexSchema = baseVertexSchema.extend({
	operation: normalVertexOperationSchema,
});

export const vertexSchema = z.union([rootVertexSchema, normalVertexSchema]);
