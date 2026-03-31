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
  nombre: string | null;
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
  slug: string | null;
  logoUrl: string | null;
  mostrarCarrito: boolean;
  moneda: string;
  emailNotification: string | null;
  urlImage: string | null;
  colores: EmpresaColores | null;
  descripcion: {
    es?: string | null;
    en?: string | null;
    fr?: string | null;
    it?: string | null;
    de?: string | null;
  } | null;
  fb?: string | null;
  instagram?: string | null;
  urlMapa?: string | null;
  direccion?: string | null;
  telefonoWhatsapp?: string | null;
}

interface TranslatableText {
  es?: string | null;
  en?: string | null;
  fr?: string | null;
  it?: string | null;
  de?: string | null;
}

export interface EmpresaPublic {
  id: string;
  nombre: string;
  dominio: string;
  mostrarCarrito: boolean;
  moneda: string;
  subdomainPedidos: string | null;
  logoUrl: string | null;
  urlImage: string | null;
  colores: EmpresaColores | null;
  descripcion: TranslatableText | null;
  titulo: string | null;
  subtitulo: string | null;
  subtitulo2: TranslatableText | null;
  footer1: TranslatableText | null;
  footer2: TranslatableText | null;
  fb: string | null;
  instagram: string | null;
  urlMapa: string | null;
  direccion: string | null;
  telefono: string | null;
  emailNotification: string | null;
}

export interface Cliente {
  id: string;
  empresaId: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  aceptar_promociones: boolean | null;
  created_at: string;
}

export interface PedidoComplemento {
  nombre?: string;
  name?: string;
  precio?: number;
  price?: number;
}

export interface PedidoItem {
  producto_id?: string;
  nombre: string;
  precio: number;
  cantidad: number;
  complementos?: PedidoComplemento[];
}

export interface CartItem {
  item?: {
    id: string;
    name: string;
    price: number;
  };
  quantity: number;
  selectedComplements?: { name: string; price: number }[];
}

export interface Pedido {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  numero_pedido: number;
  detalle_pedido: PedidoItem[];
  total: number;
  moneda: string | null;
  estado: string;
  created_at: string;
  clientes?: {
    nombre: string;
    email: string;
    telefono: string;
  };
}

export interface Promocion {
  id: string;
  empresa_id: string;
  fecha_hora: string;
  texto_promocion: string;
  numero_envios: number;
  imagen_url: string | null;
  fecha_fin: string | null;
  created_at: string;
}

export interface TgtgPromocion {
  id: string;
  empresaId: string;
  horaRecogidaInicio: string; // HH:MM
  horaRecogidaFin: string;   // HH:MM
  fechaActivacion: string;   // YYYY-MM-DD
  numeroEnvios: number;
  createdAt: string;
  items?: TgtgItem[];
}

export interface TgtgItem {
  id: string;
  tgtgPromoId: string;
  empresaId: string;
  titulo: string;
  descripcion: string | null;
  imagenUrl: string | null;
  precioOriginal: number;
  precioDescuento: number;
  cuponesTotal: number;
  cuponesDisponibles: number;
  orden: number;
  createdAt: string;
  reservasCount?: number;
}

export interface TgtgReserva {
  id: string;
  itemId: string;
  tgtgPromoId: string;
  empresaId: string;
  email: string;
  nombre: string | null;
  token: string;
  createdAt: string;
}

// ============================================
// ERROR HANDLING - Result Type Pattern
// ============================================

export type ErrorSeverity = 'error' | 'warning' | 'critical';

export type ErrorModule = 'repository' | 'use-case' | 'api' | 'middleware';

export interface AppError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  module: ErrorModule;
  method?: string;
  severity?: ErrorSeverity;
}

export type Result<T, E = AppError> =
  | { success: true; data: T }
  | { success: false; error: E };

// Helper type for functions that may return error without details
export type SimpleResult<T> = Result<T, { code: string; message: string; module: ErrorModule; method?: string }>;
