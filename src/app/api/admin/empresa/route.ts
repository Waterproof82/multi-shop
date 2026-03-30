import { NextRequest } from 'next/server';
import { empresaUseCase } from '@/core/infrastructure/database';
import { updateEmpresaSchema } from '@/core/application/dtos/empresa.dto';
import { requireAuth, requireRole, handleResult, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const result = await empresaUseCase.getById(empresaId!);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  const empresa = result.data;
  if (!empresa) {
    return errorResponse('Empresa no encontrada', 404);
  }

  return handleResult({
    success: true,
    data: {
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
    }
  });
}

export async function PUT(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const parsed = updateEmpresaSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await empresaUseCase.update(empresaId!, parsed.data);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: { success: true } });
}
