import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface Props {
  data: { value: number }[];
  color?: string;
}

export function TrendChart({ data, color = "#3b82f6" }: Props) {
  return (
    <div className="h-12 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis domain={['dataMin', 'dataMax']} hide />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
