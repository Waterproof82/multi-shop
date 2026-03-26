import type { Metadata } from "next";
import { getEmpresaByDomain } from "@/lib/server-services";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const fullDomain = await getDomainFromHeaders();
  const empresa = fullDomain ? await getEmpresaByDomain(fullDomain) : null;

  return <LoginForm empresaNombre={empresa?.nombre || null} />;
}
