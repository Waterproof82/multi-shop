import { NextRequest, NextResponse } from 'next/server';

// Auth middleware helper
export async function requireAuth(request: NextRequest): Promise<{ empresaId: string | null; error: NextResponse | null }> {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return { 
      empresaId: null, 
      error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) 
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
