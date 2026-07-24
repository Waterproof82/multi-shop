import type { Result } from '@/core/domain/entities/types';
import type { EstadoSupervisor, FichajeEvento } from '../../domain/types';
import type { IFichajeRepository } from '../../domain/interfaces/IFichajeRepository';
import type { IPerfilLaboralRepository } from '../../domain/interfaces/IPerfilLaboralRepository';

function derivarEstado(ultimo: FichajeEvento | null): EstadoSupervisor['estado'] {
  if (ultimo === null) return 'sin_datos';
  const tipo = ultimo.tipo;
  if (tipo === 'entrada' || tipo === 'fin_pausa') return 'dentro';
  if (tipo === 'inicio_pausa')                    return 'pausa';
  return 'fuera';
}

function segundosDesde(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 1000);
}

export class ObtenerEstadoSupervisorUseCase {
  constructor(
    private readonly fichajeRepo: IFichajeRepository,
    private readonly perfilRepo: IPerfilLaboralRepository,
  ) {}

  async execute(empresaId: string): Promise<Result<EstadoSupervisor[]>> {
    const perfilesResult = await this.perfilRepo.findAllByEmpresa(empresaId, true);
    if (!perfilesResult.success) return perfilesResult;

    const estados = await Promise.all(
      perfilesResult.data.map(async (perfil): Promise<EstadoSupervisor> => {
        const ultimoResult = await this.fichajeRepo.findUltimoByEmpleado(empresaId, perfil.empleadoId);
        const ultimo = ultimoResult.success ? ultimoResult.data : null;
        return {
          empleadoId:                perfil.empleadoId,
          empleadoNombre:            perfil.empleadoId, // enriched at API layer via join
          centroId:                  perfil.centroId,
          estado:                    derivarEstado(ultimo),
          ultimoEvento:              ultimo,
          tiempoDesdeUltimoEvento:   ultimo ? segundosDesde(ultimo.timestampServidor) : null,
          fichajesPendientesRevision: 0, // enriched separately if needed
        };
      })
    );

    return { success: true, data: estados };
  }
}
