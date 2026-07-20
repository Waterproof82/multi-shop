'use client';

import { Fragment } from 'react';
import type { OcupacionHeatmapRow } from '@/core/domain/entities/analytics-types';

interface HeatmapGridProps {
  rows: OcupacionHeatmapRow[];
  metric: 'count' | 'duration';
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = Array.from({ length: 7 }, (_, i) => i);

function normalizeHeatmapCell(value: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(1, value / max);
}

function buildCellMap(
  rows: OcupacionHeatmapRow[],
  metric: 'count' | 'duration'
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const val = metric === 'count' ? row.count : row.avgDurationMin;
    map.set(`${row.dow}-${row.hour}`, val);
  }
  return map;
}

function resolveMax(rows: OcupacionHeatmapRow[], metric: 'count' | 'duration'): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => (metric === 'count' ? r.count : r.avgDurationMin)));
}

export function HeatmapGrid({ rows, metric }: Readonly<HeatmapGridProps>) {
  if (rows.length === 0) {
    return (
      <p className="text-slate-400 text-center py-8">
        No hay datos para el período seleccionado
      </p>
    );
  }

  const cellMap = buildCellMap(rows, metric);
  const max = resolveMax(rows, metric);

  return (
    <div className="overflow-x-auto">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `56px repeat(24, minmax(28px, 1fr))`,
          gap: '2px',
        }}
      >
        {/* Header: empty corner + hour labels */}
        <div className="text-xs text-slate-500 flex items-end pb-1" />
        {HOURS.map((h) => (
          <div
            key={h}
            className="text-xs text-slate-500 text-center pb-1"
          >
            {String(h).padStart(2, '0')}
          </div>
        ))}

        {/* Rows: day label + 24 cells */}
        {DAYS.map((dow) => (
          <Fragment key={dow}>
            <div
              className="text-xs text-slate-400 flex items-center justify-end pr-2"
            >
              {DAY_LABELS[dow]}
            </div>
            {HOURS.map((hour) => {
              const val = cellMap.get(`${dow}-${hour}`) ?? 0;
              const opacity = normalizeHeatmapCell(val, max);
              return (
                <div
                  key={`${dow}-${hour}`}
                  className="rounded-sm min-h-[28px] flex items-center justify-center text-xs"
                  style={{
                    backgroundColor: `rgba(34, 211, 238, ${opacity})`,
                    color: opacity > 0.6 ? '#0f172a' : '#94a3b8',
                  }}
                  title={
                    metric === 'count'
                      ? `${DAY_LABELS[dow]} ${String(hour).padStart(2, '0')}:00 — ${val} sesiones`
                      : `${DAY_LABELS[dow]} ${String(hour).padStart(2, '0')}:00 — ${val} min`
                  }
                >
                  {val > 0 ? val : ''}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
