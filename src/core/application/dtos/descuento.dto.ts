import { z } from 'zod';

export const subscribeWelcomeDiscountSchema = z.object({
  email: z.string().email().max(254),
});

export const validateDiscountCodeSchema = z.object({
  codigo: z.string().min(1).max(30),
  email: z.string().email().max(254),
});

export type SubscribeWelcomeDiscountDTO = z.infer<typeof subscribeWelcomeDiscountSchema>;
export type ValidateDiscountCodeDTO = z.infer<typeof validateDiscountCodeSchema>;
