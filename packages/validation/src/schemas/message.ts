import { MessageType } from "@ts-drp/types";
import { z } from "zod";

// TODO: replace with protovalidate
export const MessageSchema = z.object({
	sender: z.string().min(1, "A valid sender must be provided"),
	type: z.nativeEnum(MessageType),
	data: z.instanceof(Uint8Array),
	objectId: z.string().min(1, "A valid object id must be provided"),
});

export type ValidatedMessage = z.infer<typeof MessageSchema>;
