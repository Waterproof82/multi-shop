import { NextRequest } from 'next/server';
import { getEmpresaUseCase } from '@/core/infrastructure/database';
import { updateEmpresaSchema } from '@/core/application/dtos/empresa.dto';
import { resolveAdminContext, handleResult, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';


export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId, isSuperAdmin } = ctx;

  if (isSuperAdmin && !empresaId) {
    return errorResponse('empresaId query param required for superadmin', 400);
  }
  
  if (!empresaId) {
    return errorResponse('Empresa ID required', 400);
  }

  const result = await getEmpresaUseCase().getById(empresaId);
  
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
      nif: empresa.nif || '',
      url_image: empresa.urlImage || null,
      descripcion_es: empresa.descripcion?.es || '',
      descripcion_en: empresa.descripcion?.en || '',
      descripcion_fr: empresa.descripcion?.fr || '',
      descripcion_it: empresa.descripcion?.it || '',
      descripcion_de: empresa.descripcion?.de || '',
      mostrar_promociones: empresa.mostrarPromociones ?? true,
      mostrar_tgtg: empresa.mostrarTgtg ?? true,
      tipoImpuesto: empresa.tipoImpuesto ?? 'iva',
      porcentajeImpuesto: empresa.porcentajeImpuesto ?? 10,
    }
  });
}

export async function PUT(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId, isSuperAdmin } = ctx;

  if (isSuperAdmin && !empresaId) {
    return errorResponse('empresaId query param required for superadmin', 400);
  }
  
  if (!empresaId) {
    return errorResponse('Empresa ID required', 400);
  }

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

  const result = await getEmpresaUseCase().update(empresaId, parsed.data);
  
  if (!result.success) {
    return handleResult(result);
  }
  
  return handleResult({ success: true, data: { success: true } });
}
