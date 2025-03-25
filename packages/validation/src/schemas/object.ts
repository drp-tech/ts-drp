import { z } from "zod";

export const CreateObjectOptionsSchema = z
	.object({
		peerId: z.string().min(1, "PeerId is required"),
	})
	.passthrough();

export type ValidatedCreateObjectOptions = z.infer<typeof CreateObjectOptionsSchema>;
