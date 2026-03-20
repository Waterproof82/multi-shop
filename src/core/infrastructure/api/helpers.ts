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

// Result handling helpers
export function handleResult<T>(result: Result<T>): NextResponse {
  if (result.success) {
    return successResponse(result.data);
  }
  return errorResponse(result.error.message);
}

export function handleResultWithStatus<T>(result: Result<T>, successStatus = 200): NextResponse {
  if (result.success) {
    return successResponse(result.data, successStatus);
  }
  return errorResponse(result.error.message);
}

// Helper to get empresaId from request headers
export function getEmpresaIdFromRequest(request: NextRequest): string | null {
  return request.headers.get('x-empresa-id');
}
