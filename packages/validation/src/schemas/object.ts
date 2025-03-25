import { z } from "zod";

export const IdSchema = z.object({
	id: z.string().min(1, "Id is required"),
});

export const CreateObjectOptionsSchema = z
	.object({
		peerId: z.string().min(1, "PeerId is required"),
	})
	.merge(IdSchema.partial())
	.passthrough();

export type ValidatedCreateObjectOptions = z.infer<typeof CreateObjectOptionsSchema>;
