'use client';

import {
  LineChart,
  BarChart,
  PieChart,
  AreaChart,
  RadialBarChart,
  Line,
  Bar,
  Pie,
  Area,
  RadialBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PolarAngleAxis,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';

type ChartDatum = Record<string, string | number>;
type ChartWidth = number | `${number}%`;

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'area' | 'composed' | 'radial';
  data: ChartDatum[];
  xAxisKey?: string;
  yAxisKey?: string | string[];
  seriesKeys?: string[]; // For multi-series charts
  title?: string;
  options?: {
    height?: number;
    width?: ChartWidth;
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
    width = '100%' as ChartWidth,
    showGrid = true,
    showLegend = true,
    showTooltip = true,
    colors = DEFAULT_COLORS,
  } = options;

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-(--border) bg-(--surface) p-4 text-center text-sm text-(--muted)">
        No data available for chart
      </div>
    );
  }

  const containerProps: { width: ChartWidth; height: number } = {
    width: '100%',
    height: height + 40,
  };

  try {
    switch (type) {
      case 'line':
        return (
          <div className="my-4 rounded-lg border border-(--border) bg-(--surface) p-3 sm:p-4 overflow-hidden">
            {title && <h4 className="mb-3 text-sm font-semibold text-foreground">{title}</h4>}
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
                      dataKey={key}
                      stroke={colors[idx % colors.length]}
                      dot={false}
                      strokeWidth={2}
                    />
                  ))
                ) : (
                  <Line type="monotone" dataKey={yAxisKey || 'value'} stroke={colors[0]} strokeWidth={2} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case 'bar':
        return (
          <div className="my-4 rounded-lg border border-(--border) bg-(--surface) p-3 sm:p-4 overflow-hidden">
            {title && <h4 className="mb-3 text-sm font-semibold text-foreground">{title}</h4>}
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
                    <Bar key={key} dataKey={key} fill={colors[idx % colors.length]} />
                  ))
                ) : (
                  <Bar dataKey={yAxisKey || 'value'} fill={colors[0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'area':
        return (
          <div className="my-4 rounded-lg border border-(--border) bg-(--surface) p-3 sm:p-4 overflow-hidden">
            {title && <h4 className="mb-3 text-sm font-semibold text-foreground">{title}</h4>}
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
                      dataKey={key}
                      fill={colors[idx % colors.length]}
                      stroke={colors[idx % colors.length]}
                      fillOpacity={0.6}
                    />
                  ))
                ) : (
                  <Area type="monotone" dataKey={yAxisKey || 'value'} fill={colors[0]} stroke={colors[0]} fillOpacity={0.6} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );

      case 'pie':
        const pieDataKey = Array.isArray(yAxisKey) ? (yAxisKey[0] || 'value') : (yAxisKey || 'value');
        return (
          <div className="my-4 rounded-lg border border-(--border) bg-(--surface) p-3 sm:p-4 overflow-hidden">
            {title && <h4 className="mb-3 text-sm font-semibold text-foreground">{title}</h4>}
            <ResponsiveContainer {...containerProps}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey={pieDataKey}
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

      case 'radial':
        const radialDataKey = Array.isArray(yAxisKey)
          ? (yAxisKey[0] || 'value')
          : (yAxisKey || seriesKeys?.[0] || 'value');
        return (
          <div className="my-4 rounded-lg border border-(--border) bg-(--surface) p-3 sm:p-4 overflow-hidden">
            {title && <h4 className="mb-3 text-sm font-semibold text-foreground">{title}</h4>}
            <ResponsiveContainer {...containerProps}>
              <RadialBarChart
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="20%"
                outerRadius="90%"
                barSize={18}
              >
                <PolarAngleAxis type="number" domain={[0, 'dataMax']} tick={false} />
                <RadialBar
                  dataKey={radialDataKey}
                  background={{ fill: 'var(--surface-strong)' }}
                  cornerRadius={8}
                  label={{ fill: 'var(--foreground)', position: 'insideStart', fontSize: 11 }}
                >
                  {data.map((_, idx) => (
                    <Cell key={`radial-cell-${idx}`} fill={colors[idx % colors.length]} />
                  ))}
                </RadialBar>
                {showTooltip && (
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-strong)',
                      border: '1px solid var(--border)',
                    }}
                  />
                )}
                {showLegend && <Legend />}
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'composed':
        // Composed chart for multi-series with mixed types
        return (
          <div className="my-4 rounded-lg border border-(--border) bg-(--surface) p-3 sm:p-4 overflow-hidden">
            {title && <h4 className="mb-3 text-sm font-semibold text-foreground">{title}</h4>}
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
                  <Bar key={`bar-${key}`} dataKey={key} fill={colors[idx % colors.length]} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        );

      default:
        return (
          <div className="rounded-lg border border-(--border) bg-(--surface) p-4 text-center text-sm text-(--muted)">
            Unknown chart type: {type}
          </div>
        );
    }
  } catch (error) {
    console.error('Chart rendering error:', error);
    return (
      <div className="rounded-lg border border-(--border) bg-(--surface) p-4 text-center text-sm text-red-500">
        Error rendering chart
      </div>
    );
  }
}

export default ChartRenderer;
