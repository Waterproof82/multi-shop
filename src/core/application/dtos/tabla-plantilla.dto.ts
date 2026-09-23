import { z } from "zod";
import { tablaCeldaSchema } from "./tabla-info.dto";

export const createTablaPlantillaSchema = z.object({
  empresaId: z.uuid(),
  nombre: z.string().min(1, "El nombre es requerido").max(100),
  columnas: z.array(tablaCeldaSchema).min(1).max(8),
});

export type CreateTablaPlantillaDTO = z.infer<typeof createTablaPlantillaSchema>;

export const tablaPlantillaIdSchema = z.object({
  id: z.uuid(),
});
