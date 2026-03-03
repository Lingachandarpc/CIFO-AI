"use client";

import React, { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import ChartRenderer, { type ChartData } from '../ChartRenderer';
import NanobotGame, { type GameConfig } from '../NanobotGame';

type TabsBlock = { label: string; content: string };
type TableBlock = { title?: string; columns: string[]; rows: string[][] };
type CanvasBlock = { title?: string; content: string };

const parseTabsBlock = (raw: string): TabsBlock[] => {
  const lines = raw.split(/\r?\n/);
  const tabs: TabsBlock[] = [];
  let current: TabsBlock | null = null;

  lines.forEach((line) => {
    const match = line.match(/^\s*(?:\*\*)?\s*Tab\s*:\s*(.+?)\s*(?:\*\*)?\s*$/i);

    if (match) {
      if (current) tabs.push(current);
      let label = match[1].trim();
      label = label.replace(/\*\*/g, '').replace(/^tab[\s:]+/i, '').trim();
      current = { label: label || 'Tab', content: '' };
      return;
    }

    if (!current) {
      current = { label: 'Overview', content: '' };
    }

    if (line.trim()) {
      current.content += `${line}\n`;
    }
  });

  if (current) tabs.push(current);
  return tabs
    .map((tab) => ({ ...tab, content: tab.content.trim() }))
    .filter((tab) => tab.content && tab.label);
};

const flattenTabsToMarkdown = (raw: string) => {
  const tabs = parseTabsBlock(raw);
  if (tabs.length === 0) return raw;
  return tabs
    .map((tab) => `### ${tab.label}\n\n${tab.content}`)
    .join('\n\n');
};

const MarkdownBody = ({ content }: { content: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {content}
  </ReactMarkdown>
);

const TabsBlockView = ({ raw }: { raw: string }) => {
  const tabs = useMemo(() => parseTabsBlock(raw), [raw]);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = tabs[activeIndex] || tabs[0];

  if (!tabs.length || !active) {
    return (
      <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
        {raw}
      </pre>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-3 py-2 overflow-x-auto">
        {tabs.map((tab, index) => (
          <button
            key={`${tab.label}-${index}`}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
              index === activeIndex
                ? 'bg-[var(--foreground)] text-[var(--background)]'
                : 'bg-[var(--surface-strong)] text-[var(--muted-strong)] hover:text-[var(--foreground)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-3 text-sm overflow-x-auto">
        <MarkdownBody content={active.content} />
      </div>
    </div>
  );
};

const parseTableBlock = (raw: string): TableBlock | null => {
  try {
    const parsed = JSON.parse(raw) as {
      title?: string;
      columns?: string[];
      rows?: Array<string[] | Record<string, string | number | boolean | null | undefined>>;
    };

    if (Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
      const rows = parsed.rows.map((row) => {
        if (Array.isArray(row)) return row.map((value) => String(value ?? ''));
        return parsed.columns!.map((key) => String((row as Record<string, unknown>)?.[key] ?? ''));
      });
      return {
        title: parsed.title,
        columns: parsed.columns.map((col) => String(col)),
        rows,
      };
    }
  } catch {
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let title = '';
  let columns: string[] = [];
  const rows: string[][] = [];

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    if (lower.startsWith('title:')) {
      title = line.split(':').slice(1).join(':').trim();
      return;
    }
    if (lower.startsWith('columns:')) {
      columns = line
        .split(':')
        .slice(1)
        .join(':')
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean);
      return;
    }
    if (lower.startsWith('row:')) {
      const row = line
        .split(':')
        .slice(1)
        .join(':')
        .split(/[;,]/)
        .map((item) => item.trim());
      if (row.length) rows.push(row);
    }
  });

  if (!columns.length || !rows.length) return null;

  const normalizedRows = rows.map((row) =>
    Array.from({ length: columns.length }, (_, index) => row[index] ?? '')
  );

  return {
    title: title || undefined,
    columns,
    rows: normalizedRows,
  };
};

const TableBlockView = ({ raw }: { raw: string }) => {
  const parsed = useMemo(() => parseTableBlock(raw), [raw]);

  if (!parsed) {
    return (
      <pre className="my-3 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
        {raw}
      </pre>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 overflow-hidden">
      {parsed.title && <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{parsed.title}</p>}
      <div className="overflow-x-auto -mx-3 -mb-3 px-3 pb-3">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {parsed.columns.map((column) => (
                <th key={column} className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted-strong)] whitespace-normal [overflow-wrap:break-word] [word-break:normal] [hyphens:auto]">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, rowIndex) => (
              <tr key={`${row.join('-')}-${rowIndex}`} className="border-b border-[var(--border)] last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`} className="px-2 sm:px-3 py-2 text-[var(--foreground)] text-xs sm:text-sm whitespace-normal [overflow-wrap:break-word] [word-break:normal] [hyphens:auto]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ProgressBlockView = ({ raw }: { raw: string }) => {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let json: {
    label?: string;
    value?: number | string;
    max?: number;
    left?: string;
    right?: string;
  } | null = null;

  try {
    json = JSON.parse(raw) as {
      label?: string;
      value?: number | string;
      max?: number;
      left?: string;
      right?: string;
    };
  } catch {
    json = null;
  }

  const getValue = (key: string) => {
    const match = lines.find((line) => line.toLowerCase().startsWith(`${key}:`));
    return match ? match.split(':').slice(1).join(':').trim() : '';
  };
  const label = json?.label || getValue('label') || 'Signal';
  const valueText =
    json?.value !== undefined
      ? `${json.value}${json?.max ? `/${json.max}` : ''}`
      : getValue('value') || '5/10';
  const left = json?.left || getValue('left') || 'Low';
  const right = json?.right || getValue('right') || 'High';

  const numericMatch = valueText.match(/(\d+(?:\.\d+)?)/);
  const numericValue = numericMatch ? Number(numericMatch[1]) : 5;
  const maxValue = valueText.includes('/')
    ? Number(valueText.split('/')[1]) || 10
    : 10;
  const percent = Math.min(100, Math.max(0, (numericValue / maxValue) * 100));

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 overflow-hidden">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-[var(--muted)] gap-2">
        <span className="truncate flex-shrink-0">{label}</span>
        <span className="text-right flex-shrink-0 ml-auto">{valueText}</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-[var(--surface-strong)] overflow-hidden">
        <div
          className="h-2 rounded-full bg-[var(--foreground)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--muted)] gap-1">
        <span className="flex-shrink-0">{left}</span>
        <span className="flex-shrink-0">{right}</span>
      </div>
    </div>
  );
};

const parseGameBlock = (raw: string): GameConfig | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<GameConfig>;
    if (parsed.type === 'tic_tac_toe' || parsed.type === 'snake' || parsed.type === 'target_tap' || parsed.type === 'number_hunt' || parsed.type === 'memory_flip') {
      return {
        type: parsed.type,
        title: parsed.title,
        description: parsed.description,
        difficulty: parsed.difficulty,
      };
    }
  } catch {
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const read = (key: string) => {
    const line = lines.find((item) => item.toLowerCase().startsWith(`${key}:`));
    return line ? line.split(':').slice(1).join(':').trim() : '';
  };
  const type = read('type').toLowerCase();
  if (type !== 'tic_tac_toe' && type !== 'snake' && type !== 'target_tap' && type !== 'number_hunt' && type !== 'memory_flip') return null;
  const difficulty = read('difficulty');

  return {
    type,
    title: read('title') || undefined,
    description: read('description') || undefined,
    difficulty: difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard' ? difficulty : undefined,
  } as GameConfig;
};

const GameBlockView = ({ raw }: { raw: string }) => {
  const config = useMemo(() => parseGameBlock(raw), [raw]);
  if (!config) {
    return (
      <pre className="my-3 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
        {raw}
      </pre>
    );
  }

  return <NanobotGame config={config} />;
};

const DiagramBlockView = ({ raw }: { raw: string }) => {
  const [svg, setSvg] = useState<string>('');
  const [hasError, setHasError] = useState(false);
  const renderId = useMemo(() => `mermaid-${Math.random().toString(36).slice(2, 10)}`, []);

  useEffect(() => {
    let mounted = true;

    const renderDiagram = async () => {
      try {
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'dark' });
        const result = await mermaid.render(renderId, raw);
        if (!mounted) return;
        setSvg(result.svg);
        setHasError(false);
      } catch (error) {
        console.error('Failed to render diagram block:', error);
        if (!mounted) return;
        setSvg('');
        setHasError(true);
      }
    };

    void renderDiagram();

    return () => {
      mounted = false;
    };
  }, [raw, renderId]);

  if (!hasError && svg) {
    return (
      <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 overflow-x-auto">
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    );
  }

  return (
    <pre className="my-3 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
      {raw}
    </pre>
  );
};

const parseCanvasBlock = (raw: string): CanvasBlock => {
  try {
    const parsed = JSON.parse(raw) as { title?: string; content?: string };
    return {
      title: parsed?.title || 'Digital note',
      content: String(parsed?.content || '').trim(),
    };
  } catch {
    return {
      title: 'Digital note',
      content: raw.trim(),
    };
  }
};

const CanvasBlockView = ({ raw }: { raw: string }) => {
  const parsed = useMemo(() => parseCanvasBlock(raw), [raw]);
  const [draft, setDraft] = useState(parsed.content);

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 overflow-hidden">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
        {parsed.title || 'Digital note'}
      </p>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={10}
        data-canvas-editor="true"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--muted-strong)]"
      />
      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">Preview</p>
        <MarkdownBody content={draft} />
      </div>
    </div>
  );
};

interface RichMarkdownProps {
  content: string;
  enableTabs?: boolean;
  enableSlider?: boolean;
}

export default function RichMarkdown({ content, enableTabs = true, enableSlider = true }: RichMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        code: ({ className, children }) => {
          const language = /language-([\w-]+)/.exec(className || '')?.[1];
          const raw = String(children).trim();
          const isInline = !className;

          if (!isInline && language === 'progress') {
            return <ProgressBlockView raw={raw} />;
          }

          if (!isInline && language === 'slider') {
            if (!enableSlider) {
              return <MarkdownBody content={raw} />;
            }
            return <ProgressBlockView raw={raw} />;
          }

          if (!isInline && language === 'tabs') {
            if (!enableTabs) {
              return <MarkdownBody content={flattenTabsToMarkdown(raw)} />;
            }
            return <TabsBlockView raw={raw} />;
          }

          if (!isInline && language === 'table') {
            return <TableBlockView raw={raw} />;
          }

          if (!isInline && language === 'game') {
            return <GameBlockView raw={raw} />;
          }

          if (!isInline && (language === 'diagram' || language === 'mermaid')) {
            return <DiagramBlockView raw={raw} />;
          }

          if (!isInline && language === 'canvas') {
            return <CanvasBlockView raw={raw} />;
          }

          if (!isInline && (language === 'json-chart' || language === 'chart')) {
            try {
              const chartData = JSON.parse(raw) as ChartData;
              return <ChartRenderer chartData={chartData} />;
            } catch (error) {
              console.error('Failed to parse chart data:', error);
            }
          }

          if (isInline) {
            return (
              <code className="rounded bg-[var(--surface-strong)] px-1.5 py-0.5 text-xs text-[var(--foreground)] break-all">
                {children}
              </code>
            );
          }

          return (
            <pre className="my-3 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
              {raw}
            </pre>
          );
        },
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all [overflow-wrap:anywhere]"
          >
            {children}
          </a>
        ),
        p: ({ children }) => {
          const text = String(children).trim();
          if (!text) return null;
          return <p className="text-sm text-[var(--foreground)] my-1 break-words [overflow-wrap:anywhere]">{children}</p>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
