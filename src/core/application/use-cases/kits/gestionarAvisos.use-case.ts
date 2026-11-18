// src/core/application/use-cases/kits/gestionarAvisos.use-case.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/),
// R-M2b.3/DD9: resuelve las tres acciones de un token de gestión —
// `consultar` (M2b8b, página GET, nunca muta ni audita), `confirmar` y
// `baja` (R-M2b.3.5, M2b6b). Un token mal formado, desconocido o un
// pendiente ya caducado devuelven `ok(null)` sin tocar la auditoría —
// `audit_log` SOLO recibe `{ serie, version }`/`{ serie }`, nunca email ni
// token (R-M2b.6.2), con `actorTipo: 'system'` porque no hay sesión.
import type { Result, AppError } from '@/core/domain/entities/types';
import type { IKitAvisosRepository } from '@/core/domain/repositories/IKitAvisosRepository';
import type { IAuditLogRepository } from '@/core/domain/repositories/IAuditLogRepository';
import type { EstadoAvisos } from '@/core/domain/entities/kit-avisos-types';
import { esTokenGestion } from '@/lib/kit-caducidad/token-gestion';

export type AccionGestion = 'consultar' | 'confirmar' | 'baja';

export interface ResultadoGestion {
  serie: string;
  estado: EstadoAvisos | 'baja';
}

function ok(data: ResultadoGestion | null): Result<ResultadoGestion | null, AppError> {
  return { success: true, data };
}

async function auditar(auditRepo: IAuditLogRepository, empresaId: string, action: 'kit.avisos.confirmado' | 'kit.avisos.baja', payload: Record<string, unknown>): Promise<void> {
  await auditRepo.insert({ empresaId, action, payload, actorId: null, actorTipo: 'system', actorNombre: null });
}

async function consultar(repo: IKitAvisosRepository, empresaId: string, token: string, pendienteCaducaAntesDe: string): Promise<Result<ResultadoGestion | null, AppError>> {
  const result = await repo.findPorToken(empresaId, token, pendienteCaducaAntesDe);
  if (!result.success) return result;
  if (!result.data) return ok(null);
  return ok({ serie: result.data.serie, estado: result.data.estado });
}

async function confirmar(
  repo: IKitAvisosRepository,
  auditRepo: IAuditLogRepository,
  empresaId: string,
  token: string,
  pendienteCaducaAntesDe: string,
): Promise<Result<ResultadoGestion | null, AppError>> {
  const result = await repo.confirmar(empresaId, token, pendienteCaducaAntesDe);
  if (!result.success) return result;
  if (!result.data) return ok(null);
  await auditar(auditRepo, empresaId, 'kit.avisos.confirmado', { serie: result.data.serie, version: result.data.version });
  return ok({ serie: result.data.serie, estado: 'registrada' });
}

async function baja(repo: IKitAvisosRepository, auditRepo: IAuditLogRepository, empresaId: string, token: string): Promise<Result<ResultadoGestion | null, AppError>> {
  const result = await repo.borrar(empresaId, token);
  if (!result.success) return result;
  if (!result.data) return ok(null);
  await auditar(auditRepo, empresaId, 'kit.avisos.baja', { serie: result.data.serie });
  return ok({ serie: result.data.serie, estado: 'baja' });
}

export async function gestionarAvisosUseCase(
  repo: IKitAvisosRepository,
  auditRepo: IAuditLogRepository,
  empresaId: string,
  token: string,
  accion: AccionGestion,
  pendienteCaducaAntesDe: string,
): Promise<Result<ResultadoGestion | null, AppError>> {
  if (!esTokenGestion(token)) return ok(null);

  if (accion === 'consultar') return consultar(repo, empresaId, token, pendienteCaducaAntesDe);
  if (accion === 'confirmar') return confirmar(repo, auditRepo, empresaId, token, pendienteCaducaAntesDe);
  return baja(repo, auditRepo, empresaId, token);
}
