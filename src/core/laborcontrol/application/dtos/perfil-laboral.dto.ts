import { z } from 'zod';

const TipoContratoEnum = z.enum([
  'indefinido',
  'temporal',
  'obra_servicio',
  'practicas',
  'formacion',
  'otro',
]);

export const CreatePerfilLaboralSchema = z.object({
  empleadoId:           z.string().uuid(),
  centroId:             z.string().uuid(),
  jornadaTeoricaHoras:  z.number().positive().max(168),
  tipoContrato:         TipoContratoEnum,
  tiempoParcial:        z.boolean().default(false),
  convenio:             z.string().max(200).optional(),
  timezone:             z.string().max(60).default('Europe/Madrid'),
});

export const UpdatePerfilLaboralSchema = z.object({
  jornadaTeoricaHoras: z.number().positive().max(168).optional(),
  tipoContrato:        TipoContratoEnum.optional(),
  tiempoParcial:       z.boolean().optional(),
  convenio:            z.string().max(200).nullable().optional(),
  timezone:            z.string().max(60).optional(),
  activo:              z.boolean().optional(),
});

export type CreatePerfilLaboralDto = z.infer<typeof CreatePerfilLaboralSchema>;
export type UpdatePerfilLaboralDto = z.infer<typeof UpdatePerfilLaboralSchema>;
