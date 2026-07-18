'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import type { BcgItem, BcgQuadrant } from '@/core/domain/entities/analytics-types';

interface BcgScatterChartProps {
  items: BcgItem[];
  medianUnidades: number;
  medianMargen: number;
}

const QUADRANT_COLOR: Record<BcgQuadrant, string> = {
  star: '#eab308',
  plow: '#22c55e',
  question: '#a855f7',
  dog: '#6b7280',
};

const QUADRANT_BG: Record<BcgQuadrant, string> = {
  star: '#eab30815',
  plow: '#22c55e15',
  question: '#a855f715',
  dog: '#6b728015',
};

const LEGEND_ITEMS: { quadrant: BcgQuadrant; label: string; desc: string }[] = [
  { quadrant: 'star', label: 'Estrella', desc: 'Alta popularidad, alto margen' },
  { quadrant: 'plow', label: 'Caballo de batalla', desc: 'Alta popularidad, bajo margen' },
  { quadrant: 'question', label: 'Interrogante', desc: 'Baja popularidad, alto margen' },
  { quadrant: 'dog', label: 'Perro', desc: 'Baja popularidad, bajo margen' },
];

interface TooltipPayload {
  name: string;
  value: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

function BcgTooltip({ active, payload }: Readonly<TooltipProps>) {
  if (!active || !payload || payload.length < 2) return null;
  return (
    <div className="bg-slate-900 border border-white/20 rounded-lg px-3 py-2 text-sm">
      <p className="font-semibold text-white">{payload[0]?.name}</p>
      <p className="text-slate-300">Unidades: {payload[0]?.value}</p>
      <p className="text-slate-300">Margen: {payload[1]?.value?.toFixed(1)} %</p>
    </div>
  );
}

export function BcgScatterChart({
  items,
  medianUnidades,
  medianMargen,
}: Readonly<BcgScatterChartProps>) {
  if (items.length === 0) {
    return (
      <p className="text-slate-400 text-center py-8">No hay datos para el período seleccionado</p>
    );
  }

  const maxX = Math.max(...items.map((i) => i.unidadesVendidas)) * 1.1;
  const maxY = Math.max(...items.map((i) => i.margenPorcentaje)) * 1.1;
  const minY = Math.min(0, Math.min(...items.map((i) => i.margenPorcentaje)) * 1.1);

  const chartData = items.map((item) => ({
    x: item.unidadesVendidas,
    y: item.margenPorcentaje,
    name: item.nombre,
    quadrant: item.quadrant,
    fill: QUADRANT_COLOR[item.quadrant],
  }));

  return (
    <div className="flex flex-col gap-4">
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            type="number"
            dataKey="x"
            name="Unidades"
            domain={[0, maxX]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            label={{ value: 'Popularidad (unidades)', fill: '#94a3b8', fontSize: 11, position: 'insideBottom', offset: -10 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Margen"
            domain={[minY, maxY]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            label={{ value: 'Margen %', fill: '#94a3b8', fontSize: 11, angle: -90, position: 'insideLeft' }}
          />
          <Tooltip content={<BcgTooltip />} />

          {/* Quadrant backgrounds */}
          <ReferenceArea x1={0} x2={medianUnidades} y1={medianMargen} y2={maxY} fill={QUADRANT_BG.question} />
          <ReferenceArea x1={medianUnidades} x2={maxX} y1={medianMargen} y2={maxY} fill={QUADRANT_BG.star} />
          <ReferenceArea x1={0} x2={medianUnidades} y1={minY} y2={medianMargen} fill={QUADRANT_BG.dog} />
          <ReferenceArea x1={medianUnidades} x2={maxX} y1={minY} y2={medianMargen} fill={QUADRANT_BG.plow} />

          {/* Median dividers */}
          <ReferenceLine x={medianUnidades} stroke="#475569" strokeDasharray="4 2" />
          <ReferenceLine y={medianMargen} stroke="#475569" strokeDasharray="4 2" />

          <Scatter
            data={chartData}
            fill="#22d3ee"
            shape={(shapeProps: unknown) => {
              const p = shapeProps as Record<string, unknown>;
              const payload = p.payload as Record<string, unknown>;
              return (
                <circle
                  cx={p.cx as number}
                  cy={p.cy as number}
                  r={6}
                  fill={payload.fill as string}
                  stroke="#0f172a"
                  strokeWidth={1}
                />
              );
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.quadrant} className="flex items-center gap-2 text-xs">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: QUADRANT_COLOR[item.quadrant] }}
            />
            <span className="text-slate-300">
              <span className="font-semibold">{item.label}</span> — {item.desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
