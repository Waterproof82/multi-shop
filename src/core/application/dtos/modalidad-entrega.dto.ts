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
  // Sin `.default(0)` aquí a propósito (I5): en Zod v4 un `.default()` del
  // schema base SOBREVIVE a `.partial()` — `updateModalidadEntregaSchema`
  // reescribiría `orden=0` en cada PUT aunque el caller no lo mandara,
  // pisando el valor real guardado. El default solo vive en
  // `createModalidadEntregaSchema`, donde SÍ tiene sentido (una fila nueva
  // sin orden explícito).
  orden: z.number().int().min(0),
});

export const createModalidadEntregaSchema = baseModalidadEntregaSchema
  .extend({
    orden: z.number().int().min(0).default(0),
    // Recogida ya no es una modalidad creable — es implícita y gratuita en
    // el backend (ver PedidoUseCase.revalidarModalidadEntrega). Solo
    // domicilio se sigue configurando desde el admin.
    tipo: z.literal('domicilio'),
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
