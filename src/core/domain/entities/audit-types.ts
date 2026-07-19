export type AuditAction =
  // TPV
  | 'tpv.turno.abrir'
  | 'tpv.turno.cerrar'
  | 'tpv.cobro.completar'
  | 'tpv.cobro.rectificar'
  | 'tpv.caja.movimiento'
  | 'tpv.stock.merma'
  | 'tpv.empleado.login'
  | 'tpv.empleado.logout'
  // Waiter
  | 'waiter.mesa.cerrar_sesion'
  | 'waiter.pedido.validar'
  | 'waiter.pago.manual'
  // Admin
  | 'admin.stock.ajuste';

export type ActorTipo = 'admin' | 'empleado_tpv' | 'waiter' | 'system';

export interface InsertAuditPayload {
  empresaId: string;
  actorId: string | null;
  actorTipo: ActorTipo;
  actorNombre?: string | null;
  action: AuditAction;
  payload: Record<string, unknown>;
}

export interface AuditLogEntry extends InsertAuditPayload {
  id: string;
  createdAt: string;
}

// Query filters for repository
export interface FindAuditOpts {
  page: number;
  limit: number;
  action?: string;
  actorTipo?: string;
  fromDate?: string; // ISO date
  toDate?: string;   // ISO date
}
