// src/core/domain/repositories/IPetPerfilRepository.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 9 (DD1): puerto del perfil público, independiente del admin
// (`IPetChapaAdminRepository`) — el admin nunca ve PII (DD7) y el perfil
// público nunca ve `email` ni `gestion_token` del dueño (DD1). Solo se
// declara aquí el método de PR9; `reservarAlta`, `findContacto`,
// `findPorToken`, `confirmar`, `liberar`, `actualizarPerfil`,
// `fijarTelefono`, `revocarTelefono`, `fijarFoto` y `purgarPendientes`
// llegan con sus propios PR (10 a 16 de tasks.md).
import type { Result } from '@/core/domain/entities/types';
import type { PerfilPublico } from '@/core/domain/entities/pet-chapa-types';

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
}
