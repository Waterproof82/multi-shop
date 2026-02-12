export interface Product {
  id: string;
  empresaId: string;
  categoriaId: string | null;
  titulo: string;
  descripcion: string | null;
  precio: number;
  fotoUrl: string | null;
  esEspecial: boolean;
  activo: boolean;
  createdAt: Date;
  // Soporte para i18n
  translations?: {
    en?: { titulo: string; descripcion: string | null };
    fr?: { titulo: string; descripcion: string | null };
    it?: { titulo: string; descripcion: string | null };
    de?: { titulo: string; descripcion: string | null };
  };
}

export interface Category {
  id: string;
  empresaId: string;
  nombre: string;
  orden: number;
}

export interface Tenant {
  id: string;
  nombre: string;
  dominio: string;
  logoUrl: string | null;
}
