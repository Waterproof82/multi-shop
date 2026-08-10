import { z } from 'zod';

export const CorreccionBodySchema = z.object({
  empleadoId:      z.uuid(),
  centroId:        z.uuid(),
  refCorreccion:   z.uuid(),
  accion:          z.enum(['rectificar', 'anular']),
  timestampEvento: z.iso.datetime().optional(),
  motivo:          z.string().min(1).max(500),
});

export type CorreccionBodyDto = z.infer<typeof CorreccionBodySchema>;
