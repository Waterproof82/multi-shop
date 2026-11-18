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
  | 'admin.stock.ajuste'
  // Kits (kit-expiry-reminders M4d, R-M4.5.3): el payload SOLO lleva `serie`,
  // nunca email/telefono — ver verContactoKit.use-case.ts.
  | 'admin.kits.ver_contacto'
  // Kits (kit-expiry-m2b, DD9 de design.md): avisos de caducidad — el
  // payload SOLO lleva `{ serie, version }` o `{ serie }`, nunca email ni
  // token, aunque la baja borre la fila. `actorTipo: 'system'` (sin sesión).
  | 'kit.avisos.confirmado'
  | 'kit.avisos.baja';

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
