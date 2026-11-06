import { z } from "zod";

export const tablaCeldaSchema = z.object({
  es: z.string().max(200),
  en: z.string().max(200).optional().nullable(),
  fr: z.string().max(200).optional().nullable(),
  it: z.string().max(200).optional().nullable(),
  de: z.string().max(200).optional().nullable(),
});

// Shape histórico: fila = array plano de celdas, sin campo de imagen.
// Aceptado por tolerancia (code deploya antes de que la migración reacomode
// los datos de `productos.tabla_info`) y transformado al shape nuevo.
export const tablaFilaLegacySchema = z.array(tablaCeldaSchema).min(1).max(8)
  .transform((celdas) => ({ celdas, imagen: null as string | null }));

export const tablaFilaSchema = z.object({
  celdas: z.array(tablaCeldaSchema).min(1).max(8),
  // `.default(null)`: los cuerpos antiguos que no envían imagen quedan
  // normalizados a `null` — el dominio (TablaFila) trabaja con string|null
  // sin `undefined`, y el repositorio escribe el campo tal cual en el JSONB.
  imagen: z.url().max(500).refine(
    (url) => url.startsWith('https://'),
    { message: 'imagen must use HTTPS' }
  ).nullable().default(null),
});

// Shape compartido entre `productos.tabla_info` (opcional, puede no tener
// tabla) y `tabla_plantillas.tabla_info` (siempre requerido). Cada consumidor
// envuelve esto con `.nullable().optional()` según corresponda.
export const tablaInfoShapeSchema = z.object({
  columnas: z.array(tablaCeldaSchema).min(1).max(8),
  filas: z.array(z.union([tablaFilaSchema, tablaFilaLegacySchema])).max(30),
}).refine(
  (val) => val.filas.every((fila) => fila.celdas.length === val.columnas.length),
  { message: 'Cada fila debe tener el mismo número de celdas que columnas' },
);

export type TablaInfoDTO = z.infer<typeof tablaInfoShapeSchema>;
