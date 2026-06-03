import { Result } from '@/core/domain/entities/types';
import { IMesaClientTokenRepository, TokenValidationResult } from '@/core/domain/repositories/IMesaClientTokenRepository';
import { IMesaSesionRepository } from '@/core/domain/repositories/IMesaSesionRepository';

const TOKEN_TTL_MINUTES = 20;

export class MesaClientTokenUseCase {
  constructor(
    private readonly tokenRepository: IMesaClientTokenRepository,
    private readonly sesionRepository: IMesaSesionRepository,
  ) {}

  async issueToken(mesaId: string): Promise<Result<{ token: string; expiresAt: string }>> {
    const sesionResult = await this.sesionRepository.findActiveSesionByMesa(mesaId);
    if (!sesionResult.success) return sesionResult as Result<never>;

    if (!sesionResult.data) {
      return {
        success: false,
        error: { code: 'SESSION_NOT_ACTIVE', message: 'No hay sesión activa para esta mesa', module: 'use-case', method: 'issueToken' },
      };
    }

    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
    const tokenResult = await this.tokenRepository.issueToken(sesionResult.data.id, expiresAt);
    if (!tokenResult.success) return tokenResult as Result<never>;

    return {
      success: true,
      data: { token: tokenResult.data.token, expiresAt: tokenResult.data.expiresAt },
    };
  }

  async validateToken(token: string): Promise<Result<TokenValidationResult>> {
    return this.tokenRepository.validateToken(token);
  }
}
