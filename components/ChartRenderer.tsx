'use client';

import { useMemo } from 'react';
import {
  LineChart,
  BarChart,
  PieChart,
  AreaChart,
  Line,
  Bar,
  Pie,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'area' | 'composed';
  data: any[];
  xAxisKey?: string;
  yAxisKey?: string | string[];
  seriesKeys?: string[]; // For multi-series charts
  title?: string;
  options?: {
    height?: number;
    width?: string;
    showGrid?: boolean;
    showLegend?: boolean;
    showTooltip?: boolean;
    colors?: string[];
  };
}

const DEFAULT_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

function getChartColor(index: number): string {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

/**
 * Parse chart JSON from markdown code blocks
 * Format: ```json-chart { "type": "line", "data": [...], ... } ```
 */
export function parseChartJson(text: string): ChartData | null {
  try {
    // Match ```json-chart or ```chart patterns
    const match = text.match(/```(?:json-)?chart\s*\n?([\s\S]*?)\n?```/);
    if (!match || !match[1]) return null;

    const parsed = JSON.parse(match[1]);
    return parsed as ChartData;
  } catch (error) {
    console.warn('Failed to parse chart JSON:', error);
    return null;
  }
}

/**
 * Main chart renderer component
 */
export function ChartRenderer({ chartData }: { chartData: ChartData }) {
  const { type, data, xAxisKey, yAxisKey, seriesKeys, title, options = {} } = chartData;

  const {
    height = 300,
    width = '100%',
    showGrid = true,
    showLegend = true,
    showTooltip = true,
    colors = DEFAULT_COLORS,
  } = options;

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-center text-sm text-[var(--muted)]">
        No data available for chart
      </div>
    );
  }

  const containerProps = {
    width: '100%' as any,
    height: height + 40,
  };

  try {
    switch (type) {
      case 'line':
        return (
          <div className="my-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            {title && <h4 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h4>}
            <ResponsiveContainer {...containerProps}>
              <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />}
                <XAxis
                  dataKey={xAxisKey || 'name'}
                  stroke="var(--muted)"
                  style={{ fontSize: '12px' }}
                />
                <YAxis stroke="var(--muted)" style={{ fontSize: '12px' }} />
                {showTooltip && <Tooltip contentStyle={{ backgroundColor: 'var(--surface-strong)', border: '1px solid var(--border)' }} />}
                {showLegend && <Legend />}
                {Array.isArray(yAxisKey) ? (
                  yAxisKey.map((key, idx) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key as any}
                      stroke={colors[idx % colors.length]}
                      dot={false}
                      strokeWidth={2}
                    />
                  ))
                ) : (
                  <Line type="monotone" dataKey={(yAxisKey || 'value') as any} stroke={colors[0]} strokeWidth={2} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case 'bar':
        return (
          <div className="my-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            {title && <h4 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h4>}
            <ResponsiveContainer {...containerProps}>
              <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />}
                <XAxis
                  dataKey={xAxisKey || 'name'}
                  stroke="var(--muted)"
                  style={{ fontSize: '12px' }}
                />
                <YAxis stroke="var(--muted)" style={{ fontSize: '12px' }} />
                {showTooltip && <Tooltip contentStyle={{ backgroundColor: 'var(--surface-strong)', border: '1px solid var(--border)' }} />}
                {showLegend && <Legend />}
                {Array.isArray(yAxisKey) ? (
                  yAxisKey.map((key, idx) => (
                    <Bar key={key} dataKey={key as any} fill={colors[idx % colors.length]} />
                  ))
                ) : (
                  <Bar dataKey={(yAxisKey || 'value') as any} fill={colors[0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'area':
        return (
          <div className="my-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            {title && <h4 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h4>}
            <ResponsiveContainer {...containerProps}>
              <AreaChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />}
                <XAxis
                  dataKey={xAxisKey || 'name'}
                  stroke="var(--muted)"
                  style={{ fontSize: '12px' }}
                />
                <YAxis stroke="var(--muted)" style={{ fontSize: '12px' }} />
                {showTooltip && <Tooltip contentStyle={{ backgroundColor: 'var(--surface-strong)', border: '1px solid var(--border)' }} />}
                {showLegend && <Legend />}
                {Array.isArray(yAxisKey) ? (
                  yAxisKey.map((key, idx) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key as any}
                      fill={colors[idx % colors.length]}
                      stroke={colors[idx % colors.length]}
                      fillOpacity={0.6}
                    />
                  ))
                ) : (
                  <Area type="monotone" dataKey={(yAxisKey || 'value') as any} fill={colors[0]} stroke={colors[0]} fillOpacity={0.6} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );

      case 'pie':
        const pieDataKey = Array.isArray(yAxisKey) ? (yAxisKey[0] || 'value') : (yAxisKey || 'value');
        return (
          <div className="my-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            {title && <h4 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h4>}
            <ResponsiveContainer {...containerProps}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey={pieDataKey as any}
                  nameKey={xAxisKey || 'name'}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                >
                  {data.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />
                  ))}
                </Pie>
                {showTooltip && <Tooltip />}
                {showLegend && <Legend />}
              </PieChart>
            </ResponsiveContainer>
          </div>
        );

      case 'composed':
        // Composed chart for multi-series with mixed types
        return (
          <div className="my-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            {title && <h4 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h4>}
            <ResponsiveContainer {...containerProps}>
              <ComposedChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />}
                <XAxis
                  dataKey={xAxisKey || 'name'}
                  stroke="var(--muted)"
                  style={{ fontSize: '12px' }}
                />
                <YAxis stroke="var(--muted)" style={{ fontSize: '12px' }} />
                {showTooltip && <Tooltip contentStyle={{ backgroundColor: 'var(--surface-strong)', border: '1px solid var(--border)' }} />}
                {showLegend && <Legend />}
                {seriesKeys?.map((key, idx) => (
                  <Bar key={`bar-${key}`} dataKey={key as any} fill={colors[idx % colors.length]} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        );

      default:
        return (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-center text-sm text-[var(--muted)]">
            Unknown chart type: {type}
          </div>
        );
    }
  } catch (error) {
    console.error('Chart rendering error:', error);
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-center text-sm text-red-500">
        Error rendering chart
      </div>
    );
  }
}

export default ChartRenderer;
