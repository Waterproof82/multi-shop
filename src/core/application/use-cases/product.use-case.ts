import { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import { Product, Result } from "@/core/domain/entities/types";
import { CreateProductDTO, UpdateProductDTO } from "@/core/application/dtos/product.dto";
import { logger } from "@/core/infrastructure/logging/logger";

export class ProductUseCase {
  constructor(private readonly productRepo: IProductRepository) {}

  async getAll(empresaId: string): Promise<Result<Product[]>> {
    try {
      const result = await this.productRepo.findAllByTenant(empresaId);
      
      if (!result.success) {
        return {
          success: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            module: 'use-case',
            method: 'ProductUseCase.getAll',
            details: result.error.details,
          },
        };
      }

      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ProductUseCase.getAll', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async create(data: CreateProductDTO): Promise<Result<Product>> {
    try {
      const result = await this.productRepo.create(data);
      
      if (!result.success) {
        return {
          success: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            module: 'use-case',
            method: 'ProductUseCase.create',
            details: result.error.details,
          },
        };
      }

      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ProductUseCase.create', {
        empresaId: data.empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async update(id: string, empresaId: string, data: Partial<UpdateProductDTO>): Promise<Result<Product>> {
    try {
      const result = await this.productRepo.update(id, empresaId, data);
      
      if (!result.success) {
        return {
          success: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            module: 'use-case',
            method: 'ProductUseCase.update',
            details: result.error.details,
          },
        };
      }

      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ProductUseCase.update', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const result = await this.productRepo.delete(id, empresaId);
      
      if (!result.success) {
        return {
          success: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            module: 'use-case',
            method: 'ProductUseCase.delete',
            details: result.error.details,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ProductUseCase.delete', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }
}
