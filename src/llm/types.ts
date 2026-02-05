import { z } from "zod";

export const RoleSchema = z.enum(["system", "user", "assistant"]);
export type Role = z.infer<typeof RoleSchema>;

export const ChatMessageSchema = z.object({
  role: RoleSchema,
  content: z.string()
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

