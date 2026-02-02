import { z } from "zod";

const ListenerFilterValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const ListenerFilterSchema = z.record(z.string(), ListenerFilterValueSchema).optional();
export type ListenerFilter = z.infer<typeof ListenerFilterSchema>;

export const AutoResumeContextSchema = z.object({
  plan: z.string().optional(),
  lastToolCalls: z.array(z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AutoResumeContext = z.infer<typeof AutoResumeContextSchema>;

export const AutoResumeOptionsSchema = z.object({
  prompt: z.string().min(1),
  context: AutoResumeContextSchema.optional(),
});
export type AutoResumeOptions = z.infer<typeof AutoResumeOptionsSchema>;

export const ListenerSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  eventType: z.string().min(1),
  filter: ListenerFilterSchema,
  once: z.boolean().optional(),
  autoResume: AutoResumeOptionsSchema.optional(),
  createdAt: z.number().finite().int(),
});
export type Listener = z.infer<typeof ListenerSchema>;

export const RegisterListenerOptionsSchema = z.object({
  sessionId: z.string().min(1),
  eventType: z.string().min(1),
  filter: ListenerFilterSchema,
  once: z.boolean().optional(),
  autoResume: AutoResumeOptionsSchema.optional(),
});
export type RegisterListenerOptions = z.infer<typeof RegisterListenerOptionsSchema>;
