import { z } from "zod";

const baseModalidadEntregaSchema = z.object({
  empresaId: z.uuid(),
  tipo: z.enum(['recogida', 'domicilio']),
  icono: z.string().min(1).max(50),
  nombre_es: z.string().min(1, "El nombre en español es requerido").max(100),
  nombre_en: z.string().max(100).optional(),
  nombre_fr: z.string().max(100).optional(),
  nombre_it: z.string().max(100).optional(),
  nombre_de: z.string().max(100).optional(),
  precioCents: z.number().int().min(0).max(100_000),
  tiempoMinMinutos: z.number().int().min(0).max(10_080).optional(),
  tiempoMaxMinutos: z.number().int().min(0).max(10_080).optional(),
  orden: z.number().int().min(0).default(0),
});

export const createModalidadEntregaSchema = baseModalidadEntregaSchema
  .superRefine((data, ctx) => {
    if (data.tipo === 'recogida') {
      if (data.tiempoMinMinutos !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'Recogida no admite tiempo estimado (siempre es inmediata)', path: ['tiempoMinMinutos'] });
      }
      if (data.tiempoMaxMinutos !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'Recogida no admite tiempo estimado (siempre es inmediata)', path: ['tiempoMaxMinutos'] });
      }
    }
  })
  .refine(
    (data) => data.tiempoMinMinutos === undefined || data.tiempoMaxMinutos === undefined || data.tiempoMinMinutos <= data.tiempoMaxMinutos,
    { message: 'El tiempo mínimo no puede ser mayor que el máximo', path: ['tiempoMaxMinutos'] }
  );

export const updateModalidadEntregaSchema = baseModalidadEntregaSchema.omit({ tipo: true }).partial().extend({
  activo: z.boolean().optional(),
});

export const modalidadEntregaIdSchema = z.object({
  id: z.uuid(),
});

export type CreateModalidadEntregaDTO = z.infer<typeof createModalidadEntregaSchema>;
export type UpdateModalidadEntregaDTO = z.infer<typeof updateModalidadEntregaSchema>;
