import { ICategoryRepository } from "@/core/domain/repositories/ICategoryRepository";
import { Category } from "@/core/domain/entities/types";
import { CreateCategoryDTO, UpdateCategoryDTO } from "@/core/application/dtos/category.dto";

export class CategoryUseCase {
  constructor(private readonly categoryRepo: ICategoryRepository) {}

  async getAll(empresaId: string): Promise<Category[]> {
    return this.categoryRepo.findAllByTenant(empresaId);
  }

  async create(data: CreateCategoryDTO): Promise<Category> {
    return this.categoryRepo.create(data);
  }

  async update(id: string, empresaId: string, data: Partial<UpdateCategoryDTO>): Promise<Category> {
    return this.categoryRepo.update(id, empresaId, data);
  }

  async delete(id: string, empresaId: string): Promise<void> {
    return this.categoryRepo.delete(id, empresaId);
  }
}
