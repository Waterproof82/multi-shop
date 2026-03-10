import { Category } from "../entities/types";

export interface CreateCategoryData {
  empresaId: string;
  nombre_es: string;
  nombre_en?: string;
  nombre_fr?: string;
  nombre_it?: string;
  nombre_de?: string;
  descripcion_es?: string;
  descripcion_en?: string;
  descripcion_fr?: string;
  descripcion_it?: string;
  descripcion_de?: string;
  orden?: number;
  categoria_complemento_de?: string | null;
  complemento_obligatorio?: boolean;
  categoria_padre_id?: string | null;
}

export interface UpdateCategoryData extends Partial<CreateCategoryData> {}

export interface ICategoryRepository {
  findAllByTenant(empresaId: string): Promise<Category[]>;
  create(data: CreateCategoryData): Promise<Category>;
  update(id: string, empresaId: string, data: Partial<UpdateCategoryData>): Promise<Category>;
  delete(id: string, empresaId: string): Promise<void>;
}
