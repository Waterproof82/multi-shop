import { IProductRepository } from "@/domain/repositories/IProductRepository";
import { CreateProductDTO, createProductSchema } from "@/application/dtos/product.dto";

export class CreateProductUseCase {
  constructor(private productRepo: IProductRepository) {}

  async execute(input: CreateProductDTO) {
    // 1. Validar Inputs
    const validatedData = createProductSchema.parse(input);

    // 2. Ejecutar persistencia (Supabase ya maneja RLS, pero validamos tenantId)
    // El repositorio se encarga de hablar con la DB
    const newProduct = await this.productRepo.create(validatedData);

    return newProduct;
  }
}
