import { NextRequest, NextResponse } from 'next/server';
import { Result } from '@/core/domain/entities/types';
import { AUTH_ERRORS, createErrorResponse } from '@/core/domain/constants/api-errors';

// Auth middleware helper
export async function requireAuth(request: NextRequest): Promise<{ empresaId: string | null; error: NextResponse | null }> {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return { 
      empresaId: null, 
      error: NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 }) 
    };
  }
  return { empresaId, error: null };
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
