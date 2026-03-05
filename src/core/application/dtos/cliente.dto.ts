import { z } from "zod";

export const createClienteSchema = z.object({
  empresaId: z.string().uuid(),
  nombre: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
});

export const updateClienteSchema = createClienteSchema.extend({
  id: z.string().uuid(),
  nombre: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  aceptar_promociones: z.boolean().optional(),
});

export const clienteIdSchema = z.object({
  id: z.string().uuid(),
});

export type CreateClienteDTO = z.infer<typeof createClienteSchema>;
export type UpdateClienteDTO = z.infer<typeof updateClienteSchema>;
