import { Category } from "../entities/types";
import { CreateCategoryDTO, UpdateCategoryDTO } from "../../application/dtos/category.dto";

export interface ICategoryRepository {
  findAllByTenant(empresaId: string): Promise<Category[]>;
  create(data: CreateCategoryDTO): Promise<Category>;
  update(id: string, empresaId: string, data: Partial<UpdateCategoryDTO>): Promise<Category>;
  delete(id: string, empresaId: string): Promise<void>;
}
