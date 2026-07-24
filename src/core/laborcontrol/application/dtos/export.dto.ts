import { z } from 'zod';

export const ExportQuerySchema = z.object({
  tipo:               z.enum(['pdf', 'excel']),
  empleadoId:         z.string().uuid().optional(),
  centroId:           z.string().uuid().optional(),
  from:               z.string().date(),
  to:                 z.string().date(),
  incluirHorasExtra:  z.coerce.boolean().default(true),
  incluirPausas:      z.coerce.boolean().default(true),
});

export const ResumenParcialQuerySchema = z.object({
  mes:  z.coerce.number().int().min(1).max(12),
  anio: z.coerce.number().int().min(2026).max(2100),
});

export type ExportQueryDto = z.infer<typeof ExportQuerySchema>;
export type ResumenParcialQueryDto = z.infer<typeof ResumenParcialQuerySchema>;
