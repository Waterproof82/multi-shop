import { NextRequest, NextResponse } from 'next/server';
import { Result } from '@/core/domain/entities/types';
import { AUTH_ERRORS, createErrorResponse } from '@/core/domain/constants/api-errors';

// Auth middleware helper
export async function requireAuth(request: NextRequest): Promise<{ empresaId: string | null; error: NextResponse | null; isSuperAdmin?: boolean }> {
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
  if (code.startsWith('AUTH_')) return 401;
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

// Helper to get empresaId from request headers
export function getEmpresaIdFromRequest(request: NextRequest): string | null {
  return request.headers.get('x-empresa-id');
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
