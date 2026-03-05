export interface Product {
  id: string;
  empresaId: string;
  categoriaId: string | null;
  titulo_es: string;
  titulo_en: string | null;
  titulo_fr: string | null;
  titulo_it: string | null;
  titulo_de: string | null;
  descripcion_es: string | null;
  descripcion_en: string | null;
  descripcion_fr: string | null;
  descripcion_it: string | null;
  descripcion_de: string | null;
  precio: number;
  fotoUrl: string | null;
  esEspecial: boolean;
  activo: boolean;
  createdAt: Date;
}

export interface Category {
  id: string;
  empresaId: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  categoriaComplementoDe: string | null;
  complementoObligatorio: boolean;
  categoriaPadreId: string | null;
  translations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  descripcionTranslations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
}

export interface Tenant {
  id: string;
  nombre: string;
  dominio: string;
  logoUrl: string | null;
}

export interface EmpresaColores {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  background: string;
  foreground: string;
}

export interface Empresa {
  id: string;
  nombre: string;
  dominio: string;
  logoUrl: string | null;
  mostrarCarrito: boolean;
  moneda: string;
  emailNotification: string | null;
  urlImage: string | null;
  colores: EmpresaColores | null;
  descripcion: {
    es?: string;
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  } | null;
}
