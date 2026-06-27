'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface ValoracionItem {
  id: string;
  mesaId: string | null;
  estrellas: number;
  createdAt: string;
}

interface ValoracionStats {
  media: number;
  total: number;
  distribucion: Record<string, number>;
}

interface ValoracionData {
  stats: ValoracionStats;
  list: ValoracionItem[];
}

function StarDisplay({ value, size = 16 }: Readonly<{ value: number; size?: number }>) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => {
        const filled = value >= s;
        const half = !filled && value >= s - 0.5;
        return (
          <Star
            key={s}
            size={size}
            fill={filled || half ? '#f5a623' : 'none'}
            stroke={filled || half ? '#f5a623' : '#d4c9b8'}
            style={half ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
          />
        );
      })}
    </span>
  );
}

export default function ValoracionesPage() {
  const { language } = useLanguage();
  const [data, setData] = useState<ValoracionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchWithCsrf(`/api/admin/valoraciones?page=${page}`)
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `Error ${r.status}`);
        setData(json as ValoracionData);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error al cargar valoraciones'))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-6">
        {t('adminValoraciones', language)}
      </h1>

      {loading && !data && (
        <p className="text-slate-400">Cargando...</p>
      )}

      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-400/20 rounded-xl px-4 py-3">{error}</p>
      )}

      {data && (
        <>
          {/* Stats card */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
              <p className="text-slate-400 text-sm mb-1">{t('adminValoracionesMedia', language)}</p>
              <p className="text-4xl font-bold text-white mb-2">{data.stats.media.toFixed(1)}</p>
              <StarDisplay value={data.stats.media} size={20} />
            </div>
            <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
              <p className="text-slate-400 text-sm mb-1">{t('adminValoracionesTotal', language)}</p>
              <p className="text-4xl font-bold text-white">{data.stats.total}</p>
            </div>
          </div>

          {/* Distribution */}
          <div className="bg-slate-800 rounded-2xl p-5 border border-white/10 mb-6">
            {['5', '4', '3', '2', '1'].map(bucket => {
              const count = data.stats.distribucion[bucket] ?? 0;
              const pct = data.stats.total > 0 ? (count / data.stats.total) * 100 : 0;
              return (
                <div key={bucket} className="flex items-center gap-3 mb-2">
                  <span className="text-slate-300 text-sm w-4">{bucket}</span>
                  <Star size={14} fill="#f5a623" stroke="#f5a623" />
                  <div className="flex-1 bg-slate-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-slate-400 text-xs w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>

          {/* Recent list */}
          {data.list.length > 0 && (
            <div className="bg-slate-800 rounded-2xl border border-white/10 overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-slate-400 px-4 py-3 font-medium">Fecha</th>
                    <th className="text-left text-slate-400 px-4 py-3 font-medium">Mesa</th>
                    <th className="text-left text-slate-400 px-4 py-3 font-medium">Estrellas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.list.map(v => (
                    <tr key={v.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-slate-300">
                        {new Date(v.createdAt).toLocaleDateString(language, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{v.mesaId ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StarDisplay value={v.estrellas} size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm disabled:opacity-40 hover:bg-slate-600 transition-colors"
            >
              Anterior
            </button>
            <button
              disabled={data.list.length < 20}
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm disabled:opacity-40 hover:bg-slate-600 transition-colors"
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
