import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireRole, successResponse, errorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { getR2Config, uploadToR2 } from '@/core/infrastructure/storage/s3-client';
import { empresaUseCase } from '@/core/infrastructure/database';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { VALIDATION_ERRORS, SERVER_ERRORS, AUTH_ERRORS, createErrorResponse } from '@/core/domain/constants/api-errors';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function validateImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  switch (mimeType) {
    case 'image/jpeg':
      return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    case 'image/png':
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    case 'image/webp':
      return buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    case 'image/gif':
      return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
    default:
      return false;
  }
}
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request);
  if (authError) return authError;
  
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const url = new URL(request.url);
  const queryEmpresaId = url.searchParams.get('empresaId');
  
  // For superadmin, require empresaId from query param
  let empresaId: string | null;
  if (isSuperAdmin) {
    if (!queryEmpresaId) {
      return NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    empresaId = queryEmpresaId;
  } else {
    empresaId = authEmpresaId;
  }
  
  if (!empresaId) {
    return NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 });
  }

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
  const empresaSlug = empresa?.slug ?? empresa?.dominio ?? empresaId;

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

    // Magic bytes validation — prevents MIME type spoofing
    if (!validateImageMagicBytes(buffer, file.type)) {
      return NextResponse.json(createErrorResponse(VALIDATION_ERRORS.INVALID_FILE_TYPE), { status: 400 });
    }

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
