import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, successResponse, errorResponse } from '@/core/infrastructure/api/helpers';
import { getR2Config, uploadToR2 } from '@/core/infrastructure/storage/s3-client';
import { empresaUseCase } from '@/core/infrastructure/database';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { VALIDATION_ERRORS, SERVER_ERRORS, AUTH_ERRORS, createErrorResponse } from '@/core/domain/constants/api-errors';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError || !empresaId) return authError ?? NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 });

  const { publicDomain } = getR2Config();
  if (!publicDomain) {
    return NextResponse.json(createErrorResponse(SERVER_ERRORS.STORAGE_ERROR));
  }

  // Derive slug from DB - never from client (OWASP: trust server-side data)
  const empresaResult = await empresaUseCase.getById(empresaId);
  if (!empresaResult.success) {
    return errorResponse(SERVER_ERRORS.DATABASE_ERROR.message);
  }
  const empresa = empresaResult.data;
  const empresaSlug = empresa?.slug ?? empresa?.dominio ?? empresaId!;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(createErrorResponse(SERVER_ERRORS.FORM_DATA_ERROR), { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json(createErrorResponse(VALIDATION_ERRORS.MISSING_FILE), { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(createErrorResponse(VALIDATION_ERRORS.INVALID_FILE_TYPE), { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(createErrorResponse(VALIDATION_ERRORS.FILE_TOO_LARGE), { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uuid = uuidv4();
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // OWASP: never use file.name from client in path (path traversal prevention)
    // We only use extension derived from validated MIME type
    const ext = MIME_TO_EXT[file.type] ?? 'bin';
    const key = `${empresaSlug}/${year}/${month}/${uuid}.${ext}`;

    await uploadToR2(key, buffer, file.type);

    const publicUrl = `${publicDomain}/${key}`;
    return successResponse({ publicUrl });
  } catch (error) {
    await logApiError('Upload image', error, 'POST');
    return NextResponse.json(createErrorResponse(SERVER_ERRORS.UPLOAD_ERROR), { status: 500 });
  }
}
