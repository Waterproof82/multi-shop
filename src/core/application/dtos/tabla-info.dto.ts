import { z } from "zod";

export const tablaCeldaSchema = z.object({
  es: z.string().max(200),
  en: z.string().max(200).optional().nullable(),
  fr: z.string().max(200).optional().nullable(),
  it: z.string().max(200).optional().nullable(),
  de: z.string().max(200).optional().nullable(),
});

// Shape compartido entre `productos.tabla_info` (opcional, puede no tener
// tabla) y `tabla_plantillas.tabla_info` (siempre requerido). Cada consumidor
// envuelve esto con `.nullable().optional()` según corresponda.
export const tablaInfoShapeSchema = z.object({
  columnas: z.array(tablaCeldaSchema).min(1).max(8),
  filas: z.array(z.array(tablaCeldaSchema).min(1).max(8)).max(30),
}).refine(
  (val) => val.filas.every((fila) => fila.length === val.columnas.length),
  { message: 'Cada fila debe tener el mismo número de celdas que columnas' },
);

export type TablaInfoDTO = z.infer<typeof tablaInfoShapeSchema>;
