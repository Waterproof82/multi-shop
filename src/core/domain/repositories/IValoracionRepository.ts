import { Result } from '../entities/types';
import type { Valoracion, ValoracionStats } from '../entities/types';

export interface CreateValoracionData {
  empresaId: string;
  mesaId: string | null;
  mesaSesionId: string | null;
  raterId: string;
  estrellas: number;
}

export interface IValoracionRepository {
  create(data: CreateValoracionData): Promise<Result<Valoracion>>;
  getStatsByEmpresa(empresaId: string): Promise<Result<ValoracionStats>>;
  listByEmpresa(empresaId: string, limit: number, offset: number): Promise<Result<Valoracion[]>>;
}
