import { z } from 'zod';

export const CorreccionBodySchema = z.object({
  empleadoId:      z.string().uuid(),
  centroId:        z.string().uuid(),
  refCorreccion:   z.string().uuid(),
  accion:          z.enum(['rectificar', 'anular']),
  timestampEvento: z.string().datetime().optional(),
  motivo:          z.string().min(1).max(500),
});

export type CorreccionBodyDto = z.infer<typeof CorreccionBodySchema>;
