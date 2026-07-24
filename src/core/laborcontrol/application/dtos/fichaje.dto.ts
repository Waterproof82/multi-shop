import { z } from 'zod';

export const FichajeBodySchema = z.object({
  empleadoId:      z.string().uuid(),
  centroId:        z.string().uuid(),
  tipo:            z.enum(['entrada', 'salida', 'inicio_pausa', 'fin_pausa']),
  timestampEvento: z.string().datetime(),
  origenOffline:   z.boolean().default(false),
  driftSegundos:   z.number().optional(),
});

export type FichajeBodyDto = z.infer<typeof FichajeBodySchema>;
