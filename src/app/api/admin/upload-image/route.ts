import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, successResponse, errorResponse } from '@/core/infrastructure/api/helpers';
import { getR2Config, uploadToR2 } from '@/core/infrastructure/storage/s3-client';
import { empresaUseCase } from '@/core/infrastructure/database';

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
  if (authError || !empresaId) return authError ?? errorResponse('No autorizado', 401);

  const { publicDomain } = getR2Config();
  if (!publicDomain) {
    return errorResponse('Configuración de almacenamiento incompleta');
  }

  // Derivar el slug desde la DB — nunca del cliente (OWASP: confianza en datos de servidor)
  const empresa = await empresaUseCase.getById(empresaId);
  const empresaSlug = empresa?.slug ?? empresa?.dominio ?? empresaId!;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('Error al leer los datos del formulario', 400);
  }

  const file = formData.get('file') as File | null;
  if (!file || !(file instanceof File)) {
    return errorResponse('No se recibió ningún archivo', 400);
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return errorResponse('Tipo de archivo no permitido. Solo JPEG, PNG, WEBP o GIF.', 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return errorResponse('El archivo excede el tamaño máximo de 10MB.', 400);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uuid = uuidv4();
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // OWASP: nunca usar file.name del cliente en el path (path traversal).
    // Usamos solo la extensión derivada del MIME type validado.
    const ext = MIME_TO_EXT[file.type] ?? 'bin';
    const key = `${empresaSlug}/${year}/${month}/${uuid}.${ext}`;

    await uploadToR2(key, buffer, file.type);

    const publicUrl = `${publicDomain}/${key}`;
    return successResponse({ publicUrl });
  } catch (error) {
    // OWASP: log interno con detalle, mensaje genérico al cliente
    console.error('[upload-image] Error:', error instanceof Error ? error.message : error);
    return errorResponse('Error al procesar la imagen', 500);
  }
}
