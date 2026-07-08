'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

interface ChartRow {
  hora: string;
  total: number;
}

interface Props {
  readonly data: ChartRow[];
}

export function TpvBarChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" vertical={false} />
        <XAxis
          dataKey="hora"
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${v}€`}
        />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8 }}
          labelStyle={{ color: '#e8eaf0', fontSize: 11 }}
          itemStyle={{ color: '#4f72ff', fontSize: 11 }}
          formatter={(v: number) => [`${v.toFixed(2)} €`, 'Ventas']}
        />
        <Bar dataKey="total" fill="#4f72ff" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
