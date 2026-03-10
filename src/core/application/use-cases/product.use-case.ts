import { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import { Product } from "@/core/domain/entities/types";
import { CreateProductDTO, UpdateProductDTO } from "@/core/application/dtos/product.dto";

export class ProductUseCase {
  constructor(private readonly productRepo: IProductRepository) {}

  async getAll(empresaId: string): Promise<Product[]> {
    return this.productRepo.findAllByTenant(empresaId);
  }

  async create(data: CreateProductDTO): Promise<Product> {
    return this.productRepo.create(data);
  }

  async update(id: string, empresaId: string, data: Partial<UpdateProductDTO>): Promise<Product> {
    return this.productRepo.update(id, empresaId, data);
  }

  async delete(id: string, empresaId: string): Promise<void> {
    return this.productRepo.delete(id, empresaId);
  }
}
