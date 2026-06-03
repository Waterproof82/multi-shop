import { Result } from '@/core/domain/entities/types';

export interface MesaClientToken {
  id: string;
  mesaSesionId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface TokenValidationResult {
  valid: boolean;
  code?: 'TOKEN_EXPIRED' | 'SESSION_CLOSED' | 'NOT_FOUND';
}

export interface IMesaClientTokenRepository {
  issueToken(mesaSesionId: string, expiresAt: Date): Promise<Result<MesaClientToken>>;
  validateToken(token: string): Promise<Result<TokenValidationResult>>;
  deleteExpired(): Promise<Result<void>>;
}
