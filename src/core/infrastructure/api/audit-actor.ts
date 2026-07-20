import type { NextRequest } from 'next/server';
import type { ActorTipo } from '@/core/domain/entities/audit-types';

export interface ResolvedActor {
  actorId: string | null;
  actorTipo: ActorTipo;
  actorNombre: string | null;
}

/**
 * Resolve actor identity from request headers.
 * @param request NextRequest with headers injected by proxy
 * @param overrideId Optional actor ID to use instead of header (for login routes)
 */
export function resolveActor(request: NextRequest, overrideId?: string | null): ResolvedActor {
  const employeeId = request.headers.get('x-employee-id');
  const adminId = request.headers.get('x-admin-id');
  const isWaiter = request.headers.get('x-waiter-role') === 'waiter';

  // Waiter routes have no per-actor identity — return null actorId
  if (isWaiter) {
    return { actorId: null, actorTipo: 'waiter', actorNombre: null };
  }

  // For login routes (where actor is only known after use-case resolves)
  if (overrideId !== undefined) {
    return { actorId: overrideId ?? null, actorTipo: 'empleado_tpv', actorNombre: null };
  }

  // Employee routes have x-employee-id header
  if (employeeId) {
    return { actorId: employeeId, actorTipo: 'empleado_tpv', actorNombre: null };
  }

  // Admin routes have x-admin-id header
  return { actorId: adminId ?? null, actorTipo: 'admin', actorNombre: null };
}
