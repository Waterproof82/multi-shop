// src/core/domain/repositories/IPetPerfilRepository.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 9 (DD1): puerto del perfil público, independiente del admin
// (`IPetChapaAdminRepository`) — el admin nunca ve PII (DD7) y el perfil
// público nunca ve `email` ni `gestion_token` del dueño (DD1). Fase 9 dejó
// solo `findPerfilActivo`; Fase 10 (DD5) añade `reservarAlta` y
// `findContacto` (necesario aquí, no solo en Fase 15, porque
// `solicitarAltaChapaUseCase` lo usa para decidir el email de «intento» —
// ver tasks.md Fase 10 punto 3). `findPorToken`, `confirmar`, `liberar`,
// `actualizarPerfil`, `fijarTelefono`, `revocarTelefono`, `fijarFoto` y
// `purgarPendientes` llegan con sus propios PR (12 a 16 de tasks.md).
import type { Result } from '@/core/domain/entities/types';
import type { PerfilPublico, AltaChapaInput, ContactoDueno, EstadoChapa } from '@/core/domain/entities/pet-chapa-types';

export interface IPetPerfilRepository {
  /**
   * R-QR.3/R-QR.6: perfil público de una chapa ACTIVA (`confirmado_at` no
   * nulo). `null` si el código no existe, está libre o pendiente — el
   * cargador (`cargar-perfil-publico.ts`) colapsa esos tres casos (y el
   * flag apagado y el límite superado) en el mismo 404 neutro (R-QR.3.2),
   * así que esta función no distingue entre ellos. El `select` nunca trae
   * `email` ni `gestion_token`.
   */
  findPerfilActivo(empresaId: string, codigo: string): Promise<Result<PerfilPublico | null>>;

  /**
   * DD5: actualización condicional atómica — `true` si reservó la fila
   * (chapa libre o con un pendiente ya caducado), `false` si estaba ocupada
   * (activa o con un pendiente vigente de OTRO alta) o el código no existe
   * en esta empresa. Calco de `IKitAvisosRepository.reservarAlta` (M2b).
   */
  reservarAlta(empresaId: string, input: AltaChapaInput): Promise<Result<boolean>>;

  /**
   * R-QR.4.4/R-QR.10: contacto actual del dueño (pendiente o activa);
   * `null` si la chapa está libre, no existe, o el pendiente ya caducado.
   * Calco de `IKitAvisosRepository.findContacto` (M2b).
   */
  findContacto(empresaId: string, codigo: string): Promise<Result<(ContactoDueno & { estado: EstadoChapa }) | null>>;
}
