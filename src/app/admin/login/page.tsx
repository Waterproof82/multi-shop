import { getEmpresaByDomain } from "@/lib/server-services";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import LoginForm from "./login-form";

export default async function AdminLoginPage() {
  const fullDomain = await getDomainFromHeaders();
  const empresa = fullDomain ? await getEmpresaByDomain(fullDomain) : null;

  return <LoginForm empresaNombre={empresa?.nombre || null} />;
}
