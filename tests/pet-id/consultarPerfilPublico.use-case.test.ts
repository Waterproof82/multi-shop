/**
 * sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
 * Fase 9: calco de `consultarEstadoKitPublicoUseCase` (M2a) — DD4 de
 * kit-expiry-m2a/design.md, reaplicado aquí: un código con forma inválida y
 * uno con forma válida pero desconocido en BD dan LO MISMO (`ok(null)`), así
 * el 404 es igual de neutro para los dos.
 */
import { describe, it, expect, vi } from 'vitest';
import { consultarPerfilPublicoUseCase } from '@/core/application/use-cases/mascotas/consultarPerfilPublico.use-case';
import { generarCodigoChapa } from '@/lib/pet-id/codigo';
import type { PerfilPublico } from '@/core/domain/entities/pet-chapa-types';

// `urlPerfilChapa`/`esCodigoChapaValido` comprueban el carácter de control
// Crockford — un literal inventado como "M-ABCD-1234-5" lo rechazaría. Se
// genera uno de verdad con bytes deterministas, igual que en
// `generarEtiquetasLoteChapa.use-case.test.ts`.
const CODIGO_VALIDO = generarCodigoChapa(() => new Uint8Array([1, 2, 3, 4, 5]));

function repoFake(resultado: unknown) {
  return { findPerfilActivo: vi.fn().mockResolvedValue(resultado) };
}

describe('consultarPerfilPublicoUseCase', () => {
  it('código con forma inválida → ok(null) sin tocar el repositorio', async () => {
    const repo = repoFake({ success: true, data: null });

    const resultado = await consultarPerfilPublicoUseCase(repo, 'empresa-1', 'no-es-un-codigo');

    expect(resultado).toEqual({ success: true, data: null });
    expect(repo.findPerfilActivo).not.toHaveBeenCalled();
  });

  it('código con forma válida → normaliza y consulta el repositorio', async () => {
    const perfil: PerfilPublico = { nombre: 'Luna', especie: 'perro', notas: null, fotoUrl: null, telefono: null };
    const repo = repoFake({ success: true, data: perfil });

    const resultado = await consultarPerfilPublicoUseCase(repo, 'empresa-1', CODIGO_VALIDO.toLowerCase());

    expect(repo.findPerfilActivo).toHaveBeenCalledWith('empresa-1', CODIGO_VALIDO);
    expect(resultado).toEqual({ success: true, data: perfil });
  });

  it('código válido pero desconocido/libre/pendiente (repo → ok(null)) se propaga igual', async () => {
    const repo = repoFake({ success: true, data: null });

    const resultado = await consultarPerfilPublicoUseCase(repo, 'empresa-1', CODIGO_VALIDO);

    expect(resultado).toEqual({ success: true, data: null });
  });

  it('un error del repositorio se propaga tal cual (nunca se disfraza de ok(null))', async () => {
    const error = { success: false as const, error: { code: 'DB_ERROR', message: 'timeout', module: 'repository' as const } };
    const repo = repoFake(error);

    const resultado = await consultarPerfilPublicoUseCase(repo, 'empresa-1', CODIGO_VALIDO);

    expect(resultado).toEqual(error);
  });
});
