import { Product } from "../entities/types";
import { CreateProductDTO, UpdateProductDTO } from "../../application/dtos/product.dto";

export interface IProductRepository {
  create(data: CreateProductDTO): Promise<Product>;
  findById(id: string): Promise<Product | null>;
  findAllByTenant(empresaId: string): Promise<Product[]>;
  update(id: string, empresaId: string, data: Partial<UpdateProductDTO>): Promise<Product>;
  delete(id: string, empresaId: string): Promise<void>;
}
