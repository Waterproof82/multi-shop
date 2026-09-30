import { z } from 'zod';
import {
  CODIGOS_ART_103,
  GARANTIA_NUEVO_MESES,
  MAX_DESISTIMIENTO_DIAS,
  MIN_DESISTIMIENTO_DIAS,
  MIN_SEGUNDA_MANO_MESES,
} from '@/core/domain/legal/constantes';
import type { ExclusionesDesistimiento, GarantiaFila } from '@/core/domain/entities/empresa-legal';

/** String opcional: '' y espacios → null. */
function textoOpcional(max: number) {
  return z.string().trim().max(max).nullable().transform((v) => (v ? v : null));
}

const emailOpcional = z
  .union([z.literal(''), z.email().max(254)])
  .nullable()
  .transform((v) => (v ? v : null));

export const garantiaFilaSchema = z
  .object({
    ambito: z.string().trim().min(1, 'Indica a qué productos aplica').max(120),
    estado: z.enum(['nuevo', 'segunda_mano']),
    mesesLegales: z.number().int().min(0).max(120),
    mesesComercialesExtra: z.number().int().min(0).max(240),
  })
  .superRefine((f, ctx) => {
    if (f.estado === 'nuevo' && f.mesesLegales !== GARANTIA_NUEVO_MESES) {
      ctx.addIssue({
        code: 'custom',
        message: 'La garantía legal de un producto nuevo es de 3 años',
        path: ['mesesLegales'],
      });
      return;
    }
    if (f.estado === 'segunda_mano' && f.mesesLegales < MIN_SEGUNDA_MANO_MESES) {
      ctx.addIssue({
        code: 'custom',
        message: 'La garantía mínima de segunda mano es de 1 año',
        path: ['mesesLegales'],
      });
    }
  });

export const garantiasSchema = z.array(garantiaFilaSchema).max(20);

export const exclusionesSchema = z.object({
  supuestos: z.array(z.enum(CODIGOS_ART_103)).max(CODIGOS_ART_103.length),
  otras: textoOpcional(500),
});

export const updateEmpresaLegalSchema = z.object({
  registroMercantil: textoOpcional(300),
  emailLegal: emailOpcional,
  direccionDevoluciones: textoOpcional(300),
  plazoDesistimientoDias: z
    .number()
    .int()
    .min(MIN_DESISTIMIENTO_DIAS, 'El plazo de desistimiento no puede ser inferior a 14 días')
    .max(MAX_DESISTIMIENTO_DIAS),
  gastosDevolucion: z.enum(['cliente', 'empresa']),
  plazoPreparacionDias: z.number().int().min(0).max(60).nullable(),
  plazoAvisoDanosHoras: z.number().int().min(1).max(720).nullable(),
  garantias: garantiasSchema,
  exclusionesDesistimiento: exclusionesSchema,
  adicionalAvisoLegal: textoOpcional(2000),
  adicionalCondiciones: textoOpcional(2000),
  adicionalEnvios: textoOpcional(2000),
  adicionalDevoluciones: textoOpcional(2000),
});

export type UpdateEmpresaLegalDTO = z.infer<typeof updateEmpresaLegalSchema>;

/** Lectura defensiva: un JSONB corrupto NO rompe la página pública, cae al default. */
export function parseGarantiasGuardadas(raw: unknown): GarantiaFila[] {
  const r = garantiasSchema.safeParse(raw);
  return r.success ? r.data : [];
}

export function parseExclusionesGuardadas(raw: unknown): ExclusionesDesistimiento {
  const r = exclusionesSchema.safeParse(raw);
  return r.success ? r.data : { supuestos: [], otras: null };
}
