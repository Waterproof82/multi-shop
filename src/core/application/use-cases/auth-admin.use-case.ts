import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { IAdminRepository, AdminWithEmpresa } from "@/core/domain/repositories/IAdminRepository";
import { LoginDTO, loginSchema } from "../dtos/auth.dto";
import { Result } from "@/core/domain/entities/types";
import { logger } from "@/core/infrastructure/logging/logger";
import { isTokenRevoked } from "@/lib/token-revocation";

const TOKEN_EXPIRY = "24h";

function anonymizeEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.substring(0, 2)}***@${domain ?? '***'}`;
}

function getTokenSecret(): Uint8Array {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('ACCESS_TOKEN_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
}

export interface LoginResult {
  token: string;
  admin: AdminWithEmpresa;
}

export class AuthAdminUseCase {
  constructor(private readonly adminRepo: IAdminRepository) {}

  async login(data: LoginDTO): Promise<Result<LoginResult>> {
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0].message,
          module: 'use-case',
          method: 'AuthAdminUseCase.login',
        },
      };
    }

    const { email, password } = parsed.data;

    // Login with password - returns Result<string> (userId)
    const loginResult = await this.adminRepo.loginWithPassword(email, password);
    if (!loginResult.success) {
      return {
        success: false,
        error: { ...loginResult.error, method: 'AuthAdminUseCase.login' },
      };
    }

    // Find admin by ID - returns Result<AdminWithEmpresa | null>
    const adminResult = await this.adminRepo.findById(loginResult.data);
    if (!adminResult.success) {
      return {
        success: false,
        error: { ...adminResult.error, method: 'AuthAdminUseCase.login' },
      };
    }

    if (!adminResult.data) {
      await logger.logAndReturnError(
        'ADMIN_NOT_AUTHORIZED',
        'Usuario no autorizado como admin',
        'use-case',
        'AuthAdminUseCase.login',
        { details: { email: anonymizeEmail(email) } }
      );
      return {
        success: false,
        error: {
          code: 'ADMIN_NOT_AUTHORIZED',
          message: 'Usuario no autorizado como admin',
          module: 'use-case',
          method: 'AuthAdminUseCase.login',
        },
      };
    }

    try {
      const token = await new SignJWT({
        adminId: adminResult.data.id,
        empresaId: adminResult.data.empresaId,
        rol: adminResult.data.rol,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(TOKEN_EXPIRY)
        .sign(getTokenSecret());

      return { success: true, data: { token, admin: adminResult.data } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'AuthAdminUseCase.login', { details: { email: anonymizeEmail(email) } });
      return { success: false, error: appError };
    }
  }

  async verifyToken(token: string): Promise<AdminWithEmpresa | null> {
    try {
      const secret = getTokenSecret();
      const { payload } = await jwtVerify(token, secret);

      // Reject tokens without jti (irrevocable) and revoked tokens (logged-out sessions).
      if (!payload.jti || await isTokenRevoked(payload.jti)) {
        return null;
      }

      const adminId = payload.adminId as string;

      // Use findById - it returns Result but we handle the case
      const result = await this.adminRepo.findById(adminId);

      if (!result.success) {
        // Log but return null (soft failure - token might be invalid)
        await logger.logError({
          codigo: 'TOKEN_VERIFY_FAILED',
          mensaje: result.error.message,
          modulo: 'use-case',
          metodo: 'AuthAdminUseCase.verifyToken',
          metadata: { adminId },
        });
        return null;
      }

      return result.data;
    } catch (e) {
      await logger.logAndReturnError(
        'TOKEN_VERIFY_FAILED',
        e instanceof Error ? e.message : 'Token verification failed',
        'use-case',
        'AuthAdminUseCase.verifyToken',
        { details: { hasToken: !!token } }
      );
      return null;
    }
  }
}
