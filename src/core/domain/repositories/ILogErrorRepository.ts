import { ErrorModule, ErrorSeverity } from '../entities/types';

export interface LogErrorData {
  empresaId?: string;
  codigo: string;
  mensaje: string;
  modulo: ErrorModule;
  metodo?: string;
  stackTrace?: string;
  requestPath?: string;
  requestMethod?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  severity?: ErrorSeverity;
}

export interface ILogErrorRepository {
  log(data: LogErrorData): Promise<void>;
}
