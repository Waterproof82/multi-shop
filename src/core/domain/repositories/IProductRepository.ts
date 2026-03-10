import { Product } from "../entities/types";

export interface CreateProductData {
  empresaId: string;
  titulo_es: string;
  titulo_en?: string | null;
  titulo_fr?: string | null;
  titulo_it?: string | null;
  titulo_de?: string | null;
  descripcion_es?: string | null;
  descripcion_en?: string | null;
  descripcion_fr?: string | null;
  descripcion_it?: string | null;
  descripcion_de?: string | null;
  precio: number;
  foto_url?: string | null;
  categoria_id?: string | null;
  es_especial?: boolean;
  activo?: boolean;
}

export interface UpdateProductData extends Partial<CreateProductData> {
  id: string;
}

export interface IProductRepository {
  create(data: CreateProductData): Promise<Product>;
  findAllByTenant(empresaId: string): Promise<Product[]>;
  update(id: string, empresaId: string, data: Partial<UpdateProductData>): Promise<Product>;
  delete(id: string, empresaId: string): Promise<void>;
}
