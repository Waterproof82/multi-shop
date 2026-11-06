import { parseMainDomain } from "@/lib/domain-utils";

export interface VolverALandingInput {
  readonly fullDomain: string;
  readonly desdeRutaCarta: boolean;
  readonly isPedidos: boolean;
  readonly rawMesaParam: boolean;
  readonly isWaiterMode: boolean;
  readonly landingHabilitada: boolean;
}

export interface VolverALandingResult {
  readonly mostrar: boolean;
  readonly urlInicio: string;
  readonly baseUrl: string;
}

function esLocalhost(domain: string): boolean {
  return domain === 'localhost' || domain.endsWith('.localhost');
}

export function resolverVolverALanding(input: VolverALandingInput): VolverALandingResult {
  // En el subdominio de pedidos SIEMPRE hay una "pagina inicial" a la que
  // volver (la landing si esta habilitada, o la carta del dominio principal
  // si no): el enlace es cross-domain y nunca es un no-op. En el dominio
  // principal (/carta) solo se muestra si la landing esta habilitada, porque
  // si no, "/" y "/carta" sirven la misma carta.
  const mostrar = !input.rawMesaParam
    && !input.isWaiterMode
    && (input.isPedidos || (input.desdeRutaCarta && input.landingHabilitada));

  const mainDomain = parseMainDomain(input.fullDomain);
  const enSubdominio = input.isPedidos && mainDomain !== input.fullDomain;
  const scheme = esLocalhost(mainDomain) ? 'http' : 'https';

  if (!mostrar) {
    return { mostrar: false, urlInicio: '/', baseUrl: '' };
  }

  if (enSubdominio) {
    return {
      mostrar: true,
      urlInicio: `${scheme}://${mainDomain}/`,
      baseUrl: `${scheme}://${mainDomain}`,
    };
  }

  return { mostrar: true, urlInicio: '/', baseUrl: '' };
}
