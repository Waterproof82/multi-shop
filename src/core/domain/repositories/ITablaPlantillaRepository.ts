import { TablaCelda, TablaPlantilla, Result } from "../entities/types";

export interface CreateTablaPlantillaData {
  empresaId: string;
  nombre: string;
  columnas: TablaCelda[];
}

export interface ITablaPlantillaRepository {
  findAllByTenant(empresaId: string): Promise<Result<TablaPlantilla[]>>;
  create(data: CreateTablaPlantillaData): Promise<Result<TablaPlantilla>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
}
