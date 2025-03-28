import { z } from "zod";

export const NodeCreateObjectOptionsSchema = z.object({
	id: z.string().min(1, "A valid object id must be provided").optional(),
	sync: z
		.object({
			enabled: z.boolean(),
			peerId: z.string().min(1, "A valid peer id must be provided").optional(),
		})
		.optional(),
});

export const NodeConnectObjectOptionsSchema = z.object({
	id: z.string().min(1, "A valid object id must be provided"),
	sync: z
		.object({
			peerId: z.string().min(1, "A valid peer id must be provided"),
		})
		.optional(),
});
