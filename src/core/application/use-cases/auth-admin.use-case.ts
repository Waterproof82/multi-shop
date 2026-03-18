import { SignJWT, jwtVerify } from "jose";
import { IAdminRepository, AdminWithEmpresa } from "@/core/domain/repositories/IAdminRepository";
import { LoginDTO, loginSchema } from "../dtos/auth.dto";
import { Result } from "@/core/domain/entities/types";
import { logger } from "@/core/infrastructure/logging/logger";

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const TOKEN_EXPIRY = "24h";

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
        { details: { email } }
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
        .setIssuedAt()
        .setExpirationTime(TOKEN_EXPIRY)
        .sign(new TextEncoder().encode(ADMIN_TOKEN_SECRET));

      return { success: true, data: { token, admin: adminResult.data } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'AuthAdminUseCase.login', { details: { email } });
      return { success: false, error: appError };
    }
  }

  async verifyToken(token: string): Promise<AdminWithEmpresa | null> {
    try {
      const secret = new TextEncoder().encode(ADMIN_TOKEN_SECRET);
      const { payload } = await jwtVerify(token, secret);

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
        { metadata: { hasToken: !!token } }
      );
      return null;
    }
  }
}
