import { getEmpresaByDomain } from "@/lib/server-services";
import { headers } from 'next/headers';
import LoginForm from "./login-form";

async function getDomainFromHeaders(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get('host');
  if (!host) return '';
  const domainWithPort = host.replace(/^www\./, '').toLowerCase();
  return domainWithPort.split(':')[0];
}

export default async function AdminLoginPage() {
  const fullDomain = await getDomainFromHeaders();
  const empresa = fullDomain ? await getEmpresaByDomain(fullDomain) : null;
  
  return <LoginForm empresaNombre={empresa?.nombre || null} />;
}
