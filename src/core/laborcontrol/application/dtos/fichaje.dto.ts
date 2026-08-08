import { z } from 'zod';

export const FichajeBodySchema = z.object({
  empleadoId:      z.uuid(),
  centroId:        z.uuid(),
  tipo:            z.enum(['entrada', 'salida', 'inicio_pausa', 'fin_pausa']),
  timestampEvento: z.iso.datetime(),

});

export type FichajeBodyDto = z.infer<typeof FichajeBodySchema>;
