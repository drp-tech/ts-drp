import { MessageType } from "@ts-drp/types";
import { z } from "zod";

export const MessageSchema = z.object({
	sender: z.string().min(1, "Sender is required"),
	type: z.nativeEnum(MessageType),
	data: z.instanceof(Uint8Array),
	objectId: z.string().min(1, "ObjectId is required"),
});

export type ValidatedMessage = z.infer<typeof MessageSchema>;
