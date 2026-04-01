import { TgtgPromocion, TgtgItem, TgtgReserva, Result } from '../entities/types';

export interface CreateTgtgItemData {
  titulo: string;
  descripcion?: string | null;
  imagenUrl?: string | null;
  precioOriginal: number;
  precioDescuento: number;
  cuponesTotal: number;
  orden: number;
}

export interface CreateTgtgPromocionData {
  empresaId: string;
  horaRecogidaInicio: string;
  horaRecogidaFin: string;
  fechaActivacion: string; // YYYY-MM-DD
  numeroEnvios: number;
  items: CreateTgtgItemData[];
}

export interface ITgtgRepository {
  findLatestByTenant(empresaId: string): Promise<Result<TgtgPromocion | null>>;
  findRecentByTenant(empresaId: string, limit: number): Promise<Result<TgtgPromocion[]>>;
  findItemsByPromo(tgtgPromoId: string): Promise<Result<TgtgItem[]>>;
  create(data: CreateTgtgPromocionData): Promise<Result<TgtgPromocion>>;
  deleteAllByTenant(empresaId: string): Promise<Result<void>>;
  deleteById(promoId: string, empresaId: string): Promise<Result<void>>;
  adjustCupones(itemId: string, delta: number): Promise<Result<TgtgItem>>;
  findReservasByPromo(tgtgPromoId: string, empresaId: string): Promise<Result<TgtgReserva[]>>;
  claimCupon(params: {
    itemId: string;
    email: string;
    nombre: string | null;
    token: string;
    tgtgPromoId: string;
    empresaId: string;
  }): Promise<Result<'ok' | 'no_cupones' | 'token_used'>>;
  isTokenUsed(token: string): Promise<Result<boolean>>;
  findItemById(itemId: string): Promise<Result<TgtgItem | null>>;
  findPromoById(tgtgPromoId: string): Promise<Result<TgtgPromocion | null>>;
  updateHoras(tgtgPromoId: string, empresaId: string, horaRecogidaInicio: string, horaRecogidaFin: string): Promise<Result<TgtgPromocion>>;
  markEmailSent(promoId: string, empresaId: string, emailCount: number): Promise<Result<TgtgPromocion>>;
}
