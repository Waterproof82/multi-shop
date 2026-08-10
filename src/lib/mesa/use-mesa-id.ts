"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Dueño único de «¿en qué mesa estoy?».
 *
 * La ruta /waiter/mesa/[mesaId] provee el context; el flujo QR del comensal
 * sigue llegando por ?mesa= en la URL. El context SIEMPRE manda: un ?mesa=
 * residual en la URL no puede pisar la mesa de la ruta.
 */
export const MesaIdContext = createContext<string | null>(null);

export function useMesaId(): string | null {
  const fromContext = useContext(MesaIdContext);
  // El query se lee en efecto: en SSR no hay location, y los consumidores
  // actuales ya leían ?mesa= tras el mount — misma semántica.
  const [fromQuery, setFromQuery] = useState<string | null>(null);

  useEffect(() => {
    setFromQuery(new URLSearchParams(globalThis.location.search).get("mesa"));
  }, []);

  return fromContext ?? fromQuery;
}
