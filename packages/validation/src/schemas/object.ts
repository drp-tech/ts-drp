import { z } from "zod";

export const CreateObjectOptionsSchema = z.object({
	peerId: z.string().min(1, "PeerId is required"),
	id: z.string().min(1, "Id is required").optional(),
});

export const NodeConnectObjectOptionsSchema = z.object({
	id: z.string().min(1, "Id is required"),
});
