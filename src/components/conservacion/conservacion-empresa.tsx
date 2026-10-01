import { useId } from 'react';
import { t } from '@/lib/translations';
import {
  textoRestante,
  urlDescarga,
  type ClaveApartado,
  type EstadoEjercicio,
  type ResumenApartado,
  type UnidadesTiempo,
} from '@/lib/empresa/retencion';

type Lang = Parameters<typeof t>[1];

interface Props {
  readonly apartados: readonly ResumenApartado[];
  readonly lang: Lang;
  /** Panel del cliente: enlaces de descarga por ejercicio. El superadmin no descarga datos de tenants. */
  readonly conDescargas?: boolean;
  /** Superadmin entrando en el panel de un tenant: las descargas llevan `?empresaId=`. */
  readonly empresaIdSuperadmin?: string;
}

const ETIQUETA: Record<ClaveApartado, Parameters<typeof t>[0]> = {
  pedidos: 'conservacionPedidos',
  cobros: 'conservacionCobros',
  turnos: 'conservacionTurnos',
  fichajes: 'conservacionFichajes',
};

function unidades(lang: Lang): UnidadesTiempo {
  return {
    anio: t('conservacionAnio', lang), anios: t('conservacionAnios', lang),
    mes: t('conservacionMes', lang), meses: t('conservacionMeses', lang),
    dia: t('conservacionDia', lang), dias: t('conservacionDias', lang),
    y: t('conservacionY', lang), hoy: t('conservacionHoy', lang),
  };
}

function conEmpresa(url: string, empresaId: string | undefined): string {
  return empresaId === undefined ? url : `${url}&empresaId=${encodeURIComponent(empresaId)}`;
}

function Estado({ ejercicio, lang }: Readonly<{ ejercicio: EstadoEjercicio; lang: Lang }>) {
  if (ejercicio.restante === null) {
    return <span className="font-medium text-amber-400">{t('conservacionCumplido', lang)}</span>;
  }
  return <span className="text-slate-400">{t('conservacionFaltan', lang).replace('{tiempo}', textoRestante(ejercicio.restante, unidades(lang)))}</span>;
}

interface ApartadoProps {
  readonly apartado: ResumenApartado;
  readonly lang: Lang;
  readonly conDescargas: boolean;
  readonly empresaIdSuperadmin?: string;
}

function Apartado({ apartado, lang, conDescargas, empresaIdSuperadmin }: ApartadoProps) {
  const tituloId = useId();
  const etiqueta = t(ETIQUETA[apartado.clave], lang);
  const fecha = new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <section aria-labelledby={tituloId} className="rounded-lg border border-white/15 p-3">
      <h4 id={tituloId} className="font-medium text-white">{etiqueta}</h4>
      <p className="text-xs text-slate-400">
        {t('conservacionPlazo', lang).replace('{n}', String(apartado.plazoAnios))} · {apartado.base}
      </p>
      <table className="mt-2 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>{t('conservacionEjercicio', lang)}</th>
            <th>{t('conservacionRegistros', lang)}</th>
            <th>{t('conservacionHasta', lang)}</th>
            <th>{t('conservacionEstado', lang)}</th>
            {conDescargas && <th>{t('conservacionDescarga', lang)}</th>}
          </tr>
        </thead>
        <tbody>
          {apartado.ejercicios.map((e) => {
            const url = conDescargas ? urlDescarga(apartado.clave, e.ejercicio) : null;
            return (
              <tr key={e.ejercicio} className="text-white">
                <td className="py-1 pr-3 font-medium tabular-nums">{e.ejercicio}</td>
                <td className="py-1 pr-3 tabular-nums text-slate-400">{e.registros}</td>
                <td className="py-1 pr-3 tabular-nums">{fecha.format(e.conservarHasta)}</td>
                <td className="py-1 pr-3"><Estado ejercicio={e} lang={lang} /></td>
                {conDescargas && (
                  <td className="py-1 text-right">
                    {url !== null && (
                      <a href={conEmpresa(url, empresaIdSuperadmin)} download className="inline-flex min-h-[44px] items-center text-cyan-300 underline">
                        <span aria-hidden="true">{t('conservacionDescargar', lang)}</span>
                        <span className="sr-only">
                          {t('conservacionDescargarDe', lang).replace('{apartado}', etiqueta.toLowerCase()).replace('{ejercicio}', String(e.ejercicio))}
                        </span>
                      </a>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Cuenta atrás de conservación por apartado y ejercicio. Solo informa: que un
 * ejercicio cumpla su plazo no lo borra (ver `src/lib/empresa/retencion.ts`).
 */
export function ConservacionEmpresa({ apartados, lang, conDescargas = false, empresaIdSuperadmin }: Props) {
  if (apartados.length === 0) {
    return <p className="text-sm text-slate-400">{t('conservacionSinDatos', lang)}</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {apartados.map((a) => (
        <Apartado key={a.clave} apartado={a} lang={lang} conDescargas={conDescargas} empresaIdSuperadmin={empresaIdSuperadmin} />
      ))}
    </div>
  );
}
