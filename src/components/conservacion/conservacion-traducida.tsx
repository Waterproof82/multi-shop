'use client';

import { useLanguage } from '@/lib/language-context';
import { resumenRetencion, type FilaRetencion } from '@/lib/empresa/retencion';
import { ConservacionEmpresa } from './conservacion-empresa';

interface Props {
  readonly filas: readonly FilaRetencion[];
  readonly conDescargas?: boolean;
  readonly empresaIdSuperadmin?: string;
}

/**
 * Envoltorio para server components: el idioma vive en el navegador, y la
 * cuenta atrás se calcula aquí con la fecha del cliente (no la del render).
 */
export function ConservacionTraducida({ filas, conDescargas, empresaIdSuperadmin }: Props) {
  const { language } = useLanguage();
  return (
    <ConservacionEmpresa
      apartados={resumenRetencion(filas, new Date())}
      lang={language}
      conDescargas={conDescargas}
      empresaIdSuperadmin={empresaIdSuperadmin}
    />
  );
}
