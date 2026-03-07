import { SignJWT, jwtVerify } from "jose";
import { adminRepository } from "@/core/infrastructure/database/index";
import { LoginDTO, loginSchema } from "../dtos/auth.dto";
import { AdminWithEmpresa } from "@/core/domain/repositories/IAdminRepository";

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const TOKEN_EXPIRY = "24h";

export class AuthAdminUseCase {
  async login(data: LoginDTO): Promise<{ token: string; admin: AdminWithEmpresa }> {
    loginSchema.parse(data);

    const { email, password } = data;

    const userId = await adminRepository.loginWithPassword(email, password);

    const admin = await adminRepository.findById(userId);

    if (!admin) {
      throw new Error("Usuario no autorizado como admin");
    }

    const token = await new SignJWT({
      adminId: admin.id,
      empresaId: admin.empresaId,
      rol: admin.rol,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(TOKEN_EXPIRY)
      .sign(new TextEncoder().encode(ADMIN_TOKEN_SECRET));

    return { token, admin };
  }

  async verifyToken(token: string): Promise<AdminWithEmpresa | null> {
    try {
      const secret = new TextEncoder().encode(ADMIN_TOKEN_SECRET);
      const { payload } = await jwtVerify(token, secret);

      const adminId = payload.adminId as string;
      const admin = await adminRepository.findById(adminId);

      return admin;
    } catch {
      return null;
    }
  }
}

export const authAdminUseCase = new AuthAdminUseCase();
