import { ICategoryRepository } from "@/core/domain/repositories/ICategoryRepository";
import { Category, Result } from "@/core/domain/entities/types";
import { CreateCategoryDTO, UpdateCategoryDTO } from "@/core/application/dtos/category.dto";
import { logger } from "@/core/infrastructure/logging/logger";

export class CategoryUseCase {
  constructor(private readonly categoryRepo: ICategoryRepository) {}

  async getAll(empresaId: string): Promise<Result<Category[]>> {
    try {
      const result = await this.categoryRepo.findAllByTenant(empresaId);
      
      if (!result.success) {
        return {
          success: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            module: 'use-case',
            method: 'CategoryUseCase.getAll',
            details: result.error.details,
          },
        };
      }

      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'CategoryUseCase.getAll', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async create(data: CreateCategoryDTO): Promise<Result<Category>> {
    try {
      const result = await this.categoryRepo.create(data);
      
      if (!result.success) {
        return {
          success: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            module: 'use-case',
            method: 'CategoryUseCase.create',
            details: result.error.details,
          },
        };
      }

      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'CategoryUseCase.create', {
        empresaId: data.empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async update(id: string, empresaId: string, data: Partial<UpdateCategoryDTO>): Promise<Result<Category>> {
    try {
      const result = await this.categoryRepo.update(id, empresaId, data);
      
      if (!result.success) {
        return {
          success: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            module: 'use-case',
            method: 'CategoryUseCase.update',
            details: result.error.details,
          },
        };
      }

      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'CategoryUseCase.update', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const result = await this.categoryRepo.delete(id, empresaId);
      
      if (!result.success) {
        return {
          success: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            module: 'use-case',
            method: 'CategoryUseCase.delete',
            details: result.error.details,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'CategoryUseCase.delete', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }
}
