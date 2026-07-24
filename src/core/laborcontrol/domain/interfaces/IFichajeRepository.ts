import type { Result } from '@/core/domain/entities/types';
import type { FichajeEvento, Correccion } from '../types';

export interface RegistrarFichajeInput {
  empresaId: string;
  centroId: string;
  empleadoId: string;
  actorId: string;
  tipo: FichajeEvento['tipo'];
  timestampEvento: Date;
  origenOffline: boolean;
  motivo?: string;
}

export interface IFichajeRepository {
  registrar(input: RegistrarFichajeInput): Promise<Result<Pick<FichajeEvento, 'recordId' | 'chainHash' | 'timestampServidor'>>>;
  registrarCorreccion(correccion: Correccion): Promise<Result<Pick<FichajeEvento, 'recordId' | 'chainHash'>>>;
  findByEmpleado(
    empresaId: string,
    empleadoId: string,
    from: Date,
    to: Date,
    includeCorrecciones?: boolean,
  ): Promise<Result<FichajeEvento[]>>;
  findUltimoByEmpleado(empresaId: string, empleadoId: string): Promise<Result<FichajeEvento | null>>;
  findByEmpresa(empresaId: string, from: Date, to: Date): Promise<Result<FichajeEvento[]>>;
  existePerfilLaboral(empresaId: string, empleadoId: string): Promise<Result<boolean>>;
}
