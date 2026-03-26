import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email inválido").max(254, "Email demasiado largo"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(128, "Contraseña demasiado larga"),
});

export type LoginDTO = z.infer<typeof loginSchema>;
