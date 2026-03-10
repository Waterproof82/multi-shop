import { z } from "zod";

export const createClienteSchema = z.object({
  empresaId: z.string().uuid(),
  nombre: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  telefono: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
});

// Update schema - no requiere empresaId
export const updateClienteSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  telefono: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
  aceptar_promociones: z.boolean().optional().nullable(),
});

export const clienteIdSchema = z.object({
  id: z.string().uuid(),
});

export type CreateClienteDTO = z.infer<typeof createClienteSchema>;
export type UpdateClienteDTO = z.infer<typeof updateClienteSchema>;
