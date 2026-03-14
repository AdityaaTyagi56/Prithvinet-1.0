import React from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck } from 'lucide-react';

interface ForecastData {
  timestamp: string;
  point: number;
  lower: number;
  upper: number;
}

interface Props {
  data: ForecastData[];
  parameter: string;
  unit: string;
}

export function ForecastChart({ data, parameter, unit }: Props) {
  // Transform data to have an array for the Area chart [lower, upper]
  const chartData = data.map(d => ({
    ...d,
    ci: [d.lower, d.upper]
  }));

  return (
    <div className="w-full">
      <div className="flex items-center space-x-2 mb-4">
        <ShieldCheck className="text-[#1a365d] h-5 w-5" />
        <span className="text-sm font-medium text-gray-600">95% Confidence Interval</span>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              stroke="#718096"
              fontSize={12}
            />
            <YAxis stroke="#718096" fontSize={12} />
            <Tooltip 
              labelFormatter={(label) => new Date(label).toLocaleString()}
              contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#2d3748' }}
              labelStyle={{ color: '#718096' }}
              itemStyle={{ color: '#2d3748' }}
            />
            <Area 
              type="monotone" 
              dataKey="ci" 
              stroke="none" 
              fill="#3182ce" 
              fillOpacity={0.12} 
              name="95% CI"
            />
            <Line 
              type="monotone" 
              dataKey="point" 
              stroke="#1a365d" 
              strokeWidth={2}
              dot={false}
              name={`${parameter} (${unit})`}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
