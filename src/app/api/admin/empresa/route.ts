import { NextRequest } from 'next/server';
import { empresaUseCase } from '@/core/infrastructure/database';
import { updateEmpresaSchema } from '@/core/application/dtos/empresa.dto';
import { requireAuth, successResponse, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  try {
    const empresa = await empresaUseCase.getById(empresaId!);
    if (!empresa) {
      return errorResponse('Empresa no encontrada', 404);
    }

    return successResponse({
      email_notification: empresa.emailNotification || '',
      telefono_whatsapp: empresa.telefonoWhatsapp || '',
      nombre: empresa.nombre || '',
      logo_url: empresa.logoUrl || null,
      fb: empresa.fb || '',
      instagram: empresa.instagram || '',
      url_mapa: empresa.urlMapa || '',
      direccion: empresa.direccion || '',
      url_image: empresa.urlImage || null,
      descripcion_es: empresa.descripcion?.es || '',
      descripcion_en: empresa.descripcion?.en || '',
      descripcion_fr: empresa.descripcion?.fr || '',
      descripcion_it: empresa.descripcion?.it || '',
      descripcion_de: empresa.descripcion?.de || '',
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
    await empresaUseCase.update(empresaId!, parsed.data);
    return successResponse({ success: true });
  } catch {
    return errorResponse('Error al actualizar empresa');
  }
}
