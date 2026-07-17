import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Result } from '@/core/domain/entities/types';
import { AUTH_ERRORS, createErrorResponse } from '@/core/domain/constants/api-errors';
import { rateLimitAdmin } from './rate-limit';

/**
 * Result type for requireAuth - returned from authentication middleware.
 * - When authenticated: { empresaId, error: null, isSuperAdmin }
 * - When unauthorized: { empresaId: null, error: NextResponse (401), isSuperAdmin }
 */
export type AuthResult = {
  empresaId: string | null;
  error: NextResponse | null;
  isSuperAdmin?: boolean;
};

// Auth middleware helper
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const empresaId = request.headers.get('x-empresa-id');
  const adminRol = request.headers.get('x-admin-rol');
  const isSuperAdmin = adminRol === 'superadmin';
  
  // Superadmin can have empty empresaId (set by proxy when JWT has null)
  // They will use query params to specify which empresa to operate on
  if (!empresaId && !isSuperAdmin) {
    return { 
      empresaId: null, 
      error: NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 }),
      isSuperAdmin 
    };
  }
  return { empresaId: empresaId || null, error: null, isSuperAdmin };
}

// Response helpers
export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function validationErrorResponse(errors: string): NextResponse {
  return NextResponse.json({ error: errors }, { status: 400 });
}

/** Maps known error codes to appropriate HTTP status codes */
function errorCodeToStatus(code: string): number {
  if (code === 'VALIDATION_ERROR') return 400;
  if (code === 'PRODUCT_NOT_FOUND' || code === 'NOT_FOUND') return 404;
  if (code === 'AUTH_003' || code === 'AUTH_FORBIDDEN' || code === 'FORBIDDEN') return 403;
  if (code === 'PAYMENT_IN_PROGRESS') return 423;
  if (code.startsWith('AUTH_')) return 401;
  if (code.startsWith('DEL_')) return 400;
  if (code.startsWith('GLV_') || code.startsWith('PAY_')) return 503;
  if (code.startsWith('DLV_')) return 422;
  if (code.endsWith('_NOT_FOUND')) return 404;
  if (code === 'COMPRAS_PROVEEDOR_HAS_TRANSACTIONS') return 409;
  if (code === 'COMPRAS_FACTURA_YA_PAGADA' || code === 'COMPRAS_ALBARAN_YA_RECIBIDO') return 409;
  if (code.startsWith('COMPRAS_') || code === 'SANIDAD_TRAZABILIDAD_REQUERIDA') return 422;
  return 500;
}

// Result handling helpers
export function handleResult<T>(result: Result<T>): NextResponse {
  if (result.success) {
    return successResponse(result.data);
  }
  return errorResponse(result.error.message, errorCodeToStatus(result.error.code));
}

export function handleResultWithStatus<T>(result: Result<T>, successStatus = 200): NextResponse {
  if (result.success) {
    return successResponse(result.data, successStatus);
  }
  return errorResponse(result.error.message, errorCodeToStatus(result.error.code));
}

const empresaIdSchema = z.string().uuid();

/**
 * Unified admin context resolver — call this at the top of every admin route handler.
 * Handles: rate limiting, authentication, role check (admin|superadmin), and
 * empresaId resolution (including superadmin empresa override via query param).
 *
 * On success: returns { empresaId, isSuperAdmin, error: null }
 * On failure: returns { error: NextResponse } — the caller must `return ctx.error`.
 *
 * Usage:
 *   const ctx = await resolveAdminContext(request);
 *   if (ctx.error) return ctx.error;
 *   const { empresaId, isSuperAdmin } = ctx;
 */
export type AdminContext =
  | { empresaId: string | null; isSuperAdmin: boolean; error: null }
  | { empresaId: null; isSuperAdmin: boolean; error: NextResponse };

export async function resolveAdminContext(request: NextRequest): Promise<AdminContext> {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return { empresaId: null, isSuperAdmin: false, error: rateLimited };

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin = false } = await requireAuth(request);
  if (authError) return { empresaId: null, isSuperAdmin, error: authError };

  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return { empresaId: null, isSuperAdmin, error: roleError };

  const queryEmpresaId = new URL(request.url).searchParams.get('empresaId');
  const resolvedEmpresaId = isSuperAdmin && queryEmpresaId
    ? (empresaIdSchema.safeParse(queryEmpresaId).data ?? authEmpresaId)
    : authEmpresaId;

  return { empresaId: resolvedEmpresaId, isSuperAdmin, error: null };
}

/**
 * Variant of resolveAdminContext that additionally requires a non-null empresaId.
 * Use this on tenant-scoped admin routes where acting without a specific empresa makes no sense.
 * Returns 400 if the caller is a superadmin who did not provide ?empresaId=.
 *
 * On success: returns { empresaId: string (never null), isSuperAdmin, error: null }
 * On failure: returns { error: NextResponse } — the caller must `return ctx.error`.
 *
 * Usage:
 *   const ctx = await resolveAdminContextWithEmpresa(request);
 *   if (ctx.error) return ctx.error;
 *   const { empresaId } = ctx; // empresaId is string, never null
 */
export type AdminContextWithEmpresa =
  | { empresaId: string; isSuperAdmin: boolean; error: null }
  | { empresaId: null; isSuperAdmin: boolean; error: NextResponse };

export async function resolveAdminContextWithEmpresa(request: NextRequest): Promise<AdminContextWithEmpresa> {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx;
  if (!ctx.empresaId) {
    return {
      empresaId: null,
      isSuperAdmin: ctx.isSuperAdmin,
      error: NextResponse.json({ error: 'Se requiere empresaId' }, { status: 400 }),
    };
  }
  return { empresaId: ctx.empresaId, isSuperAdmin: ctx.isSuperAdmin, error: null };
}

/**
 * RBAC guard — verifies that the authenticated admin has one of the allowed roles.
 * Reads the `x-admin-rol` header injected by the proxy after JWT verification.
 * Returns a 403 response if the role check fails, or null if the request may proceed.
 *
 * Usage:
 *   const forbidden = await requireRole(request, ['superadmin']);
 *   if (forbidden) return forbidden;
 */
export function requireRole(request: NextRequest, allowedRoles: string[]): NextResponse | null {
  const role = request.headers.get('x-admin-rol');
  if (!role || !allowedRoles.includes(role)) {
    return NextResponse.json(createErrorResponse(AUTH_ERRORS.FORBIDDEN), { status: 403 });
  }
  return null;
}
