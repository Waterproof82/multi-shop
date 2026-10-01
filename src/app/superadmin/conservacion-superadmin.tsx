import type { FilaRetencionEmpresa } from '@/core/domain/repositories/IHistorialRepository';
import { ConservacionTraducida } from '@/components/conservacion/conservacion-traducida';

interface Props {
  readonly empresas: readonly { id: string; nombre: string }[];
  readonly filas: readonly FilaRetencionEmpresa[];
}

/**
 * Cuenta atrás de conservación de cada empresa. Sin descargas: el superadmin
 * no se lleva datos de los tenants; si hace falta, entra en su panel ("Editar")
 * y descarga desde "Conservación de datos" como lo haría el propio admin.
 */
export function ConservacionSuperadmin({ empresas, filas }: Props) {
  return (
    <section aria-labelledby="conservacion-titulo" className="space-y-4">
      <div>
        <h3 id="conservacion-titulo" className="text-lg font-semibold text-white">Conservación de datos</h3>
        <p className="mt-1 text-sm text-slate-400">
          Cuánto falta para que cada ejercicio cumpla su plazo legal. Cumplido, nada se borra solo: lo decide cada empresa.
        </p>
      </div>
      <div className="space-y-2">
        {empresas.map((empresa) => {
          const suyas = filas
            .filter((f) => f.empresaId === empresa.id)
            .map(({ apartado, ejercicio, registros }) => ({ apartado, ejercicio, registros }));
          return (
            <details key={empresa.id} className="rounded-xl border border-white/15 bg-white/5 p-4">
              <summary className="min-h-[44px] cursor-pointer font-medium text-white">{empresa.nombre}</summary>
              <div className="mt-3">
                <ConservacionTraducida filas={suyas} />
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
