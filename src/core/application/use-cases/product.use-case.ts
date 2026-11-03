import { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import { Product, Result } from "@/core/domain/entities/types";
import { CreateProductDTO, UpdateProductDTO } from "@/core/application/dtos/product.dto";
import { logger } from "@/core/infrastructure/logging/logger";
import { slugify, siguienteSlugLibre } from "@/core/domain/productos/slug";

const UNIQUE_VIOLATION = 'UNIQUE_VIOLATION';

export class ProductUseCase {
  constructor(private readonly productRepo: IProductRepository) {}

  /** Siguiente slug libre para `tituloEs` dentro de `empresaId` (ver slug.ts). */
  private async resolverSlugAutogenerado(empresaId: string, tituloEs: string): Promise<string> {
    const base = slugify(tituloEs);
    const ocupadosResult = await this.productRepo.findSlugsByPrefix(empresaId, base);
    const ocupados = ocupadosResult.success ? new Set(ocupadosResult.data) : new Set<string>();
    return siguienteSlugLibre(base, ocupados);
  }

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

  /**
   * `esTienda` lo resuelve el caller (la ruta admin) consultando el tipo de
   * empresa — ver tarea 1.8. El slug SOLO se autogenera cuando la empresa
   * es tienda y no llegó uno (editar el título nunca lo rewrites); un slug
   * puesto a mano por el admin se respeta tal cual.
   */
  async create(data: CreateProductDTO, esTienda: boolean): Promise<Result<Product>> {
    try {
      const autogenerado = esTienda && !data.slug;
      const payload = autogenerado
        ? { ...data, slug: await this.resolverSlugAutogenerado(data.empresaId, data.titulo_es) }
        : data;

      let result = await this.productRepo.create(payload);

      if (!result.success && result.error.code === UNIQUE_VIOLATION) {
        if (autogenerado) {
          const retrySlug = await this.resolverSlugAutogenerado(data.empresaId, data.titulo_es);
          result = await this.productRepo.create({ ...data, slug: retrySlug });
        }
        if (!result.success && result.error.code === UNIQUE_VIOLATION) {
          return { success: false, error: { code: 'CONFLICT', message: 'El slug ya está en uso', module: 'use-case', method: 'ProductUseCase.create' } };
        }
      }

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

  async update(id: string, empresaId: string, data: Partial<UpdateProductDTO>, esTienda: boolean): Promise<Result<Product>> {
    try {
      const autogenerado = esTienda && !data.slug && !!data.titulo_es;
      const payload = autogenerado
        ? { ...data, slug: await this.resolverSlugAutogenerado(empresaId, data.titulo_es as string) }
        : data;

      let result = await this.productRepo.update(id, empresaId, payload);

      if (!result.success && result.error.code === UNIQUE_VIOLATION) {
        if (autogenerado) {
          const retrySlug = await this.resolverSlugAutogenerado(empresaId, data.titulo_es as string);
          result = await this.productRepo.update(id, empresaId, { ...data, slug: retrySlug });
        }
        if (!result.success && result.error.code === UNIQUE_VIOLATION) {
          return { success: false, error: { code: 'CONFLICT', message: 'El slug ya está en uso', module: 'use-case', method: 'ProductUseCase.update' } };
        }
      }

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
