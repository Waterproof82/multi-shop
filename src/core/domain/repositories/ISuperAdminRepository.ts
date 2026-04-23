import { Empresa, Result } from "../entities/types";

export interface EmpresaStats {
  totalPedidos: number;
  pedidosPendientes: number;
  totalClientes: number;
  totalProductos: number;
  pedidosHoy: number;
  pedidosMes: number;
  cuponesPromoValidados: number;
  cuponesTgtgValidados: number;
  cuponesTgtgTotales: number;
}

export interface SuperAdminGlobalStats {
  totalEmpresas: number;
  totalPedidos: number;
  totalPedidosHoy: number;
  totalPedidosMes: number;
  totalClientes: number;
  totalProductos: number;
  empresasRanking: {
    empresaId: string;
    empresaNombre: string;
    empresaDominio: string;
    empresaLogoUrl: string | null;
    pedidosMes: number;
    posicion: number;
  }[];
}

export interface EmpresaWithStats {
  id: string;
  nombre: string;
  dominio: string;
  slug: string | null;
  logoUrl: string | null;
  mostrarCarrito: boolean;
  mostrarPromociones: boolean;
  mostrarTgtg: boolean;
  moneda: string;
  emailNotification: string | null;
  urlImage: string | null;
  descripcion: {
    es?: string | null;
    en?: string | null;
    fr?: string | null;
    it?: string | null;
    de?: string | null;
  } | null;
  colores: Empresa['colores'];
  fb?: string | null;
  instagram?: string | null;
  urlMapa?: string | null;
  direccion?: string | null;
  telefonoWhatsapp?: string | null;
  subdomainPedidos: string | null;
  titulo: string | null;
  subtitulo: string | null;
  subtitulo2: {
    es?: string | null;
    en?: string | null;
    fr?: string | null;
    it?: string | null;
    de?: string | null;
  } | null;
  footer1: {
    es?: string | null;
    en?: string | null;
    fr?: string | null;
    it?: string | null;
    de?: string | null;
  } | null;
  footer2: {
    es?: string | null;
    en?: string | null;
    fr?: string | null;
    it?: string | null;
    de?: string | null;
  } | null;
  stats: EmpresaStats;
  createdAt: string;
  seoStatus: {
    hasDescription: boolean;
    hasLogo: boolean;
    hasUrlMapa: boolean;
    hasGeoCoordinates: boolean;
    hasFb: boolean;
    hasInstagram: boolean;
    hasMetaDescription: boolean;
  };
}

export interface ISuperAdminRepository {
  findAllEmpresas(): Promise<Result<EmpresaWithStats[]>>;
  findEmpresaById(id: string): Promise<Result<EmpresaWithStats | null>>;
  updateEmpresa(id: string, data: Record<string, unknown>): Promise<Result<void>>;
  getEmpresaStats(empresaId: string): Promise<Result<EmpresaStats>>;
  getGlobalStats(): Promise<Result<SuperAdminGlobalStats>>;
}
