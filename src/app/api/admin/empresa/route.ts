import { NextRequest } from 'next/server';
import { empresaRepository } from '@/core/infrastructure/database';
import { updateEmpresaSchema } from '@/core/application/dtos/empresa.dto';
import { requireAuth, successResponse, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  try {
    const empresa = await empresaRepository.getById(empresaId!);
    if (!empresa) {
      return errorResponse('Empresa no encontrada', 404);
    }
    
    return successResponse({
      email_notification: empresa.emailNotification || '',
      telefono_whatsapp: '',
      nombre: empresa.nombre || '',
      logo_url: empresa.logoUrl || null,
      fb: '',
      instagram: '',
      url_mapa: '',
      direccion: '',
    });
  } catch {
    return errorResponse('Error al obtener empresa');
  }
}

export async function PUT(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = updateEmpresaSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  try {
    await empresaRepository.update(empresaId!, parsed.data);
    return successResponse({ success: true });
  } catch {
    return errorResponse('Error al actualizar empresa');
  }
}
