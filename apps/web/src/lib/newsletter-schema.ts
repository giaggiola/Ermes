import { z } from "zod";

export const newsletterSubscribeSchema = z.object({
  client_ip: z.string().trim().min(1).max(64).optional(),
  consented_at: z.string().datetime({ offset: true }).optional(),
  email: z.string().trim().max(320),
  first_name: z.string().trim().max(100).optional(),
  form_id: z.string().trim().max(100).optional(),
  source: z.string().trim().max(100).optional(),
});

export type NewsletterSubscribeInput = z.infer<
  typeof newsletterSubscribeSchema
>;
