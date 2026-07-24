import { SupabaseFichajeRepository } from './SupabaseFichajeRepository';
import { SupabasePerfilLaboralRepository } from './SupabasePerfilLaboralRepository';
import { SupabaseChainRepository } from './SupabaseChainRepository';
import { SupabaseAuditRepository } from './SupabaseAuditRepository';
import { SupabaseHoldRepository } from './SupabaseHoldRepository';
import { SupabaseExportRepository } from './SupabaseExportRepository';
import { RegistrarFichajeUseCase } from '../application/use-cases/RegistrarFichaje.usecase';
import { RegistrarCorreccionUseCase } from '../application/use-cases/RegistrarCorreccion.usecase';
import { ObtenerMisFichajesUseCase } from '../application/use-cases/ObtenerMisFichajes.usecase';
import { ObtenerEstadoSupervisorUseCase } from '../application/use-cases/ObtenerEstadoSupervisor.usecase';
import { GenerarExportUseCase } from '../application/use-cases/GenerarExport.usecase';
import { GenerarResumenParcialUseCase } from '../application/use-cases/GenerarResumenParcial.usecase';
import { GestionarHoldUseCase } from '../application/use-cases/GestionarHold.usecase';
import { VerificarCadenaUseCase } from '../application/use-cases/VerificarCadena.usecase';

// Lazy singletons
let _fichajeRepo: SupabaseFichajeRepository | undefined;
let _perfilRepo: SupabasePerfilLaboralRepository | undefined;
let _chainRepo: SupabaseChainRepository | undefined;
let _auditRepo: SupabaseAuditRepository | undefined;
let _holdRepo: SupabaseHoldRepository | undefined;
let _exportRepo: SupabaseExportRepository | undefined;

function getFichajeRepo() { return (_fichajeRepo ??= new SupabaseFichajeRepository()); }
function getPerfilRepo()  { return (_perfilRepo  ??= new SupabasePerfilLaboralRepository()); }
function getChainRepo()   { return (_chainRepo   ??= new SupabaseChainRepository()); }
function getAuditRepo()   { return (_auditRepo   ??= new SupabaseAuditRepository()); }
function getHoldRepo()    { return (_holdRepo    ??= new SupabaseHoldRepository()); }
function getExportRepo()  { return (_exportRepo  ??= new SupabaseExportRepository()); }

// Use case factories (new instance per request is fine — they hold no state)
export function getLcRegistrarFichajeUseCase() {
  return new RegistrarFichajeUseCase(getFichajeRepo(), getAuditRepo());
}

export function getLcRegistrarCorreccionUseCase() {
  return new RegistrarCorreccionUseCase(getFichajeRepo(), getAuditRepo());
}

export function getLcObtenerMisFichajesUseCase() {
  return new ObtenerMisFichajesUseCase(getFichajeRepo());
}

export function getLcObtenerEstadoSupervisorUseCase() {
  return new ObtenerEstadoSupervisorUseCase(getFichajeRepo(), getPerfilRepo());
}

export function getLcGenerarExportUseCase() {
  return new GenerarExportUseCase(getExportRepo());
}

export function getLcGenerarResumenParcialUseCase() {
  return new GenerarResumenParcialUseCase(getExportRepo());
}

export function getLcGestionarHoldUseCase() {
  return new GestionarHoldUseCase(getHoldRepo(), getAuditRepo());
}

export function getLcVerificarCadenaUseCase() {
  return new VerificarCadenaUseCase(getChainRepo(), getAuditRepo());
}

export function getLcChainRepo() { return getChainRepo(); }
export function getLcPerfilRepo() { return getPerfilRepo(); }
export function getLcHoldRepo() { return getHoldRepo(); }
