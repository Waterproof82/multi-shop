import { z } from 'zod';

export const subscribeWelcomeDiscountSchema = z.object({
  email: z.email().max(254),
  /**
   * Canal de captación. `'tienda'` (default) = popup de bienvenida de la
   * tienda, que espera su propio email de Brevo. `'lista-pdf'` = el form de
   * la web de marketing (lista de 72 horas): la web ya envía SU email con el
   * PDF adjunto, así que aquí no se envía email al visitante y el código se
   * devuelve en la respuesta para que la web lo incruste; el lead se guarda
   * en `clientes` SIN consentimiento de marketing (el consent del form cubre
   * la entrega de lista+código, no campañas futuras).
   */
  origen: z.enum(['tienda', 'lista-pdf']).default('tienda'),
});

export const validateDiscountCodeSchema = z.object({
  codigo: z.string().min(1).max(30),
  email: z.email().max(254),
});

export type SubscribeWelcomeDiscountDTO = z.infer<typeof subscribeWelcomeDiscountSchema>;
export type ValidateDiscountCodeDTO = z.infer<typeof validateDiscountCodeSchema>;
