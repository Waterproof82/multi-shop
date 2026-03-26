import { z } from "zod";

export const createClienteSchema = z.object({
  empresaId: z.string().uuid(),
  nombre: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  telefono: z.string().min(7).max(30).regex(/^\+?[0-9\s\-()+]+$/).optional().nullable(),
  direccion: z.string().max(500).optional().nullable(),
});

// Update schema - does not require empresaId
export const updateClienteSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  telefono: z.string().min(7).max(30).regex(/^\+?[0-9\s\-()+]+$/).optional().nullable(),
  direccion: z.string().max(500).optional().nullable(),
  aceptar_promociones: z.boolean().optional().nullable(),
});

export const clienteIdSchema = z.object({
  id: z.string().uuid(),
});

export type CreateClienteDTO = z.infer<typeof createClienteSchema>;
export type UpdateClienteDTO = z.infer<typeof updateClienteSchema>;
