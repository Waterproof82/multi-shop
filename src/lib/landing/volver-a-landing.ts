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
  const mostrar = input.landingHabilitada
    && !input.rawMesaParam
    && !input.isWaiterMode
    && (input.desdeRutaCarta || input.isPedidos);

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
