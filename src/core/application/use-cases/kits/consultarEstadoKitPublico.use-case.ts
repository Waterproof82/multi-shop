// src/core/application/use-cases/kits/consultarEstadoKitPublico.use-case.ts
// kit-expiry-m2a (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2a/)
// R-M2a.1.2/R-M2a.1.3/R-M2a.1.7/R-M2a.2: normaliza y valida la serie de la
// URL, lee el lote y sus caducidades efectivas, y construye el estado
// público del kit. DD4: una serie inválida y una serie desconocida devuelven
// LO MISMO (`ok(null)`) — el cargador no distingue entre los dos casos, así
// que el 404 es igual de neutro para los dos (R-M2a.1.3).
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { EstadoKitPublico } from '@/core/domain/entities/kit-caducidad-types';
import { normalizarSerie, esSerieValida } from '@/lib/kit-caducidad/serie';
import { estadoDelKit } from '@/lib/kit-caducidad/estado';
import { URL_LISTA_MOCHILA, urlPackRecambio } from '@/lib/kit-caducidad/etiqueta-urls';

// DD5 de design.md: el caso de uso declara solo lo que usa.
export type KitPublicoRepo = Pick<IKitCaducidadRepository, 'findKitPublico' | 'findCaducidadesEfectivas'>;

const SIN_RESULTADO: Result<EstadoKitPublico | null, AppError> = { success: true, data: null };

export async function consultarEstadoKitPublicoUseCase(
  repo: KitPublicoRepo,
  empresaId: string,
  serieCruda: string,
  hoy: string,
): Promise<Result<EstadoKitPublico | null, AppError>> {
  const serie = normalizarSerie(serieCruda);
  if (!serie || !esSerieValida(serie)) return SIN_RESULTADO;

  const kitResult = await repo.findKitPublico(empresaId, serie);
  if (!kitResult.success) return kitResult;
  if (!kitResult.data) return SIN_RESULTADO;
  const { loteId, kitNombre, kitSlug } = kitResult.data;

  const caducidadesResult = await repo.findCaducidadesEfectivas(empresaId, loteId);
  if (!caducidadesResult.success) return caducidadesResult;

  const { general, elementos } = estadoDelKit(hoy, caducidadesResult.data);

  return {
    success: true,
    data: {
      serie,
      kitNombre,
      general,
      // R-M2a.2.1: nunca se expone `ingredienteId` fuera del dominio.
      elementos: elementos.map(({ ingredienteId: _ingredienteId, ...elemento }) => elemento),
      enlaces: { lista: URL_LISTA_MOCHILA, recambio: urlPackRecambio(kitSlug) },
    },
  };
}
