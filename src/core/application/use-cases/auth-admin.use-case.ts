import { SignJWT, jwtVerify } from "jose";
import { IAdminRepository, AdminWithEmpresa } from "@/core/domain/repositories/IAdminRepository";
import { LoginDTO, loginSchema } from "../dtos/auth.dto";

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const TOKEN_EXPIRY = "24h";

export class AuthAdminUseCase {
  constructor(private readonly adminRepo: IAdminRepository) {}

  async login(data: LoginDTO): Promise<{ token: string; admin: AdminWithEmpresa }> {
    loginSchema.parse(data);

    const { email, password } = data;

    const userId = await this.adminRepo.loginWithPassword(email, password);

    const admin = await this.adminRepo.findById(userId);

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
      const admin = await this.adminRepo.findById(adminId);

      return admin;
    } catch {
      return null;
    }
  }
}
