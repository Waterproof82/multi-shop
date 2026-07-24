// ============================================================
// LaborControl — Domain Types
// Bounded context: fichaje digital (RD-Ley 8/2019, Art. 34.9 ET)
// ============================================================

export type FichajeTipo = 'entrada' | 'salida' | 'inicio_pausa' | 'fin_pausa' | 'correccion';
export type FichajeAccion = 'rectificar' | 'anular';
export type Compensacion = 'salario' | 'descanso';
export type TipoContrato =
  | 'indefinido'
  | 'temporal'
  | 'obra_servicio'
  | 'practicas'
  | 'formacion'
  | 'otro';

// Core domain entity — mirrors lc_fichajes columns
export interface FichajeEvento {
  recordId: string;
  chainSeq: number;
  empresaId: string;
  centroId: string;
  empleadoId: string;
  actorId: string;
  tipo: FichajeTipo;
  accion: FichajeAccion | null;
  refCorreccion: string | null;
  timestampEvento: Date;
  timestampServidor: Date;
  origenOffline: boolean;
  motivo: string | null;
  chainHash: string;
  prevHash: string;
  createdAt: Date;
}

// Labor profile — extends empleados_tpv identity
export interface PerfilLaboral {
  id: string;
  empresaId: string;
  empleadoId: string;
  centroId: string;
  jornadaTeoricaHoras: number;
  tipoContrato: TipoContrato;
  tiempoParcial: boolean;
  convenio: string | null;
  timezone: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Correction (a FichajeEvento with tipo='correccion')
export interface Correccion {
  empleadoId: string;
  centroId: string;
  empresaId: string;
  accion: FichajeAccion;
  refCorreccion: string;
  timestampEvento: Date;
  motivo: string;
  actorId: string;
  origenOffline: boolean;
}

// Overtime entry
export interface HorasExtra {
  id: string;
  empresaId: string;
  empleadoId: string;
  centroId: string;
  fecha: string; // YYYY-MM-DD
  horasExtra: number;
  compensacion: Compensacion;
  notas: string | null;
  registradoPor: string;
  createdAt: Date;
}

// Legal hold
export interface LegalHold {
  id: string;
  empresaId: string;
  empleadoId: string | null; // null = empresa-wide hold
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string;
  motivo: string;
  actorId: string;
  activo: boolean;
  createdAt: Date;
  liftedAt: Date | null;
}

// Chain anchor — sealed monthly segment summary
export interface ChainAnchor {
  id: string;
  empresaId: string;
  segmentYear: number;
  segmentMonth: number;
  finalHash: string;
  recordCount: number;
  sealedAt: Date;
  sealedBy: string;
}

// Audit log entry
export interface AuditEntry {
  id: string;
  empresaId: string;
  actorId: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  timestampServidor: Date;
}

// View model for supervisor dashboard
export interface EstadoSupervisor {
  empleadoId: string;
  empleadoNombre: string;
  centroId: string;
  estado: 'dentro' | 'pausa' | 'fuera' | 'sin_datos';
  ultimoEvento: FichajeEvento | null;
  tiempoDesdeUltimoEvento: number | null; // seconds
  fichajesPendientesRevision: number;
}

// Export query — use case input
export interface ExportQuery {
  empresaId: string;
  empleadoId: string | null;
  centroId: string | null;
  from: Date;
  to: Date;
  format: 'pdf' | 'excel';
  incluirPausas: boolean;
  incluirHorasExtra: boolean;
  incluirResumenParcial: boolean;
}

// Chain segment verification result
export interface ChainVerifyResult {
  segment: string; // YYYY-MM
  status: 'ok' | 'broken' | 'tampered' | 'empty';
  totalRows: number;
  brokenAt: number | null; // chain_seq of first bad link
  message: string;
  verifiedAt: Date;
}

// Offline queue item (IndexedDB)
export interface OfflineQueueItem {
  localId: string;
  empleadoId: string;
  centroId: string;
  tipo: FichajeTipo;
  timestampEvento: string; // ISO 8601
  clockOffsetMs: number;
  localHash: string;
  encryptedPayload: string; // AES-GCM: base64(IV).base64(ciphertext)
  createdAt: string;
  attempts: number;
  status: 'pending' | 'failed' | 'synced';
  errorMessage: string | null;
}
