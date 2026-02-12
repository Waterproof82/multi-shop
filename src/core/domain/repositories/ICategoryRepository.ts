import { Category } from "../entities/types";

export interface ICategoryRepository {
  findAllByTenant(empresaId: string): Promise<Category[]>;
}
