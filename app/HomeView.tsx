"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { SearchMode, Settings, ChatMessage, HistoryItem, HistoryConversationEntry, Language, TextToSpeechProvider, Genre, VoiceGender, AIModel, VoiceProfile, DEFAULT_GOOGLE_VOICE } from './types';
import { SettingsIcon, HistoryIcon, PlayIcon, MicIcon, StopIcon, VolumeIcon } from '../components/Icons';
import ThemeToggle from '../components/ThemeToggle';
import SearchBar, { type AttachedFile } from '../components/SearchBar';
import { generateNarrative, generateSpeech, decodeAudio, getAudioBuffer, generateSuggestions, generateToolImage, generateToolVideo, pollToolVideoStatus } from './services/openaiService';
import MediaEditorDialog from '../components/MediaEditorDialog';
import { generateSpeechWithElevenLabs } from './services/elevenLabsService';
import { filterVoicesByGender, generateSpeechWithGoogle, getGoogleLanguageCode, listGoogleVoices, resolveGoogleVoice, GoogleVoice } from './services/googleTtsService';
import { createAmbientMusicForGenre, stopAmbientMusic as stopMusicService } from './services/backgroundMusicService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import ChartRenderer, { type ChartData } from '../components/ChartRenderer';
import NanobotCanvas from '../components/NanobotCanvas';
import NanobotGame, { type GameConfig } from '../components/NanobotGame';

type TabsBlock = { label: string; content: string };
type TableBlock = { title?: string; columns: string[]; rows: string[][] };
type MediaDialogState = {
  open: boolean;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  modelUsed?: string;
};

const AVAILABLE_GAMES = [
  { key: 'tic_tac_toe', label: 'Tic-Tac-Toe' },
  { key: 'snake', label: 'Snake' },
  { key: 'target_tap', label: 'Target Tap' },
  { key: 'number_hunt', label: 'Number Hunt' },
  { key: 'memory_flip', label: 'Memory Flip' },
] as const;

const detectRequestedGame = (query: string): GameConfig['type'] | null => {
  const lowered = query.toLowerCase();
  if (lowered.includes('tic tac toe') || lowered.includes('tictactoe') || lowered.includes('tic-tac-toe')) {
    return 'tic_tac_toe';
  }
  if (lowered.includes('snake')) {
    return 'snake';
  }
  if (lowered.includes('target') || lowered.includes('tap game') || lowered.includes('reaction')) {
    return 'target_tap';
  }
  if (lowered.includes('number') || lowered.includes('hunt')) {
    return 'number_hunt';
  }
  if (lowered.includes('memory') || lowered.includes('match card') || lowered.includes('flip card')) {
    return 'memory_flip';
  }
  return null;
};

const detectDifficulty = (query: string): NonNullable<GameConfig['difficulty']> => {
  const lowered = query.toLowerCase();
  if (/(hard|expert|difficult)/.test(lowered)) return 'hard';
  if (/(easy|beginner|simple)/.test(lowered)) return 'easy';
  return 'medium';
};

const isGameIntent = (query: string) => {
  const lowered = query.toLowerCase();
  return /(game|play|bored|fun|mini game|minigame)/.test(lowered);
};

const hasGameBlock = (text: string) => /```game[\s\S]*?```/i.test(text);

const buildLocalGameResponse = (query: string) => {
  const selected = detectRequestedGame(query);
  const difficulty = detectDifficulty(query);
  const catalog = AVAILABLE_GAMES.map((item) => item.label).join(', ');
  const suggestions = [
    'Play Tic-Tac-Toe (Easy)',
    'Play Snake (Medium)',
    'Play Snake (Hard)',
    'Play Memory Flip',
  ];

  if (!selected) {
    return {
      content: `What type of game do you want to play?\n\nAvailable games: ${catalog}.\n\nReply with a game name and optional difficulty (easy / medium / hard).`,
      suggestions,
    };
  }

  const title = AVAILABLE_GAMES.find((item) => item.key === selected)?.label || 'Nanobot Game';
  const isDifficultyGame = selected === 'tic_tac_toe' || selected === 'snake';
  const description = selected === 'snake'
    ? 'Use arrow keys or on-screen controls.'
    : selected === 'tic_tac_toe'
      ? 'Beat Nanobot on the board.'
      : 'Tap Reset to start.';

  const config = {
    type: selected,
    title,
    description,
    ...(isDifficultyGame ? { difficulty } : {}),
  };

  return {
    content: `\
\
\
\`\`\`game
${JSON.stringify(config)}
\`\`\``,
    suggestions,
  };
};

const appendGameSuggestionBlock = (text: string, query: string, interactionMode: 'read' | 'listen') => {
  if (interactionMode !== 'read') return text;
  if (!isGameIntent(query)) return text;
  if (hasGameBlock(text)) return text;

  const selected = detectRequestedGame(query) || 'tic_tac_toe';
  const catalog = AVAILABLE_GAMES.map((item) => item.label).join(' • ');
  const unknownSpecific = /chess|sudoku|crossword|2048|pong|flappy|ludo|carrom/.test(query.toLowerCase())
    && !AVAILABLE_GAMES.some((item) => query.toLowerCase().includes(item.label.toLowerCase()));

  const recommendation = unknownSpecific
    ? `\n\n**Available games right now:** ${catalog}.`
    : '';

  return `${text.trim()}${recommendation}\n\n**Play in chat:**\n\`\`\`game\n{"type":"${selected}","title":"${AVAILABLE_GAMES.find((item) => item.key === selected)?.label || 'Nanobot Game'}","description":"Tap Reset to start."}\n\`\`\``;
};

const parseTabsBlock = (raw: string): TabsBlock[] => {
  const lines = raw.split(/\r?\n/);
  const tabs: TabsBlock[] = [];
  let current: TabsBlock | null = null;

  lines.forEach((line) => {
    // Match only explicit tab declarations to avoid false positives from regular bold markdown
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
  return tabs.map((tab) => ({ ...tab, content: tab.content.trim() }))
    .filter((tab) => tab.content && tab.label);
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
                <th key={column} className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted-strong)] whitespace-nowrap">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, rowIndex) => (
              <tr key={`${row.join('-')}-${rowIndex}`} className="border-b border-[var(--border)] last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`} className="px-2 sm:px-3 py-2 text-[var(--foreground)] text-xs sm:text-sm whitespace-normal break-words">
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

const RichMarkdown = ({ content }: { content: string }) => (
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
          return <ProgressBlockView raw={raw} />;
        }

        if (!isInline && language === 'tabs') {
          return <TabsBlockView raw={raw} />;
        }

        if (!isInline && language === 'table') {
          return <TableBlockView raw={raw} />;
        }

        if (!isInline && language === 'game') {
          return <GameBlockView raw={raw} />;
        }

        if (!isInline && language === 'diagram') {
          return (
            <pre className="my-3 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
              {raw}
            </pre>
          );
        }

        // Chart detection - handle json-chart code blocks
        if (!isInline && (language === 'json-chart' || language === 'chart')) {
          try {
            const chartData = JSON.parse(raw) as ChartData;
            return <ChartRenderer chartData={chartData} />;
          } catch (error) {
            console.error('Failed to parse chart data:', error);
            // Fall through to regular code block display
          }
        }

        if (isInline) {
          return (
            <code className="rounded bg-[var(--surface-strong)] px-1.5 py-0.5 text-xs text-[var(--foreground)]">
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
      p: ({ children }) => {
        // Skip rendering empty or whitespace-only paragraphs
        const text = String(children).trim();
        if (!text) return null;
        
        // Reduce paragraph margins to prevent gaps before tables
        return (
          <p className="text-sm text-[var(--foreground)] my-1">{children}</p>
        );
      },
    }}
  >
    {content}
  </ReactMarkdown>
);

export default function HomeView() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('auto');
  const [mediaDialog, setMediaDialog] = useState<MediaDialogState | null>(null);
  const [isMediaRegenerating, setIsMediaRegenerating] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>(SearchMode.CASE_STUDY);
  const [interactionMode, setInteractionMode] = useState<"read" | "listen">("read");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyTab, setHistoryTab] = useState<"all" | "chat" | "voice">("all"); // NEW: History tab filter
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listenStatus, setListenStatus] = useState<"idle" | "listening" | "thinking" | "narrating" | "completed">("idle");
  const [pulse, setPulse] = useState(0);
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileJumpOpen, setIsMobileJumpOpen] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [readSuggestions, setReadSuggestions] = useState<string[]>([]);
  const [activeNarrationKey, setActiveNarrationKey] = useState<string | null>(null);
  const [isHistoryNarrationLoading, setIsHistoryNarrationLoading] = useState(false);
  const { status } = useSession();
  const [authCheckAuthenticated, setAuthCheckAuthenticated] = useState(false);
  const isSessionAuthenticated = status === 'authenticated';
  const isAuthenticated = isSessionAuthenticated || authCheckAuthenticated;
  const [userId, setUserId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>({
    narrationType: 'Realistic',
    voiceType: DEFAULT_GOOGLE_VOICE,
    voiceGender: VoiceGender.AUTO,
    language: Language.ENGLISH,
    ttsProvider: TextToSpeechProvider.GOOGLE,
    aiModel: AIModel.AUTO,
    enableBackgroundMusic: false,
    backgroundMusicVolume: 0.15,
    enableWebSearch: true,
  });
  const [googleVoices, setGoogleVoices] = useState<GoogleVoice[]>([]);
  const [lastAutoModel, setLastAutoModel] = useState<AIModel | null>(null);
  const [latestResponseModel, setLatestResponseModel] = useState<AIModel | null>(null);
  const [userProfile, setUserProfile] = useState<{
    name?: string;
    age?: number | null;
    location?: string;
    interests?: string;
    pulse?: string;
    bio?: string;
  } | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [completedTypewriterMap, setCompletedTypewriterMap] = useState<Record<string, boolean>>({});
  const [typewriterState, setTypewriterState] = useState<{ messageId: string | null; text: string }>({ messageId: null, text: '' });

  const audioContextRef = useRef<AudioContext | null>(null);
  const readScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const userMessageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScrollUserIdRef = useRef<string | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const typewriterFrameRef = useRef<number | null>(null);
  const activeTypewriterMessageRef = useRef<string | null>(null);
  const settingsSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const TYPEWRITER_CHARS_PER_SECOND = 250; // Increased for faster typing effect
  const getHistoryStorageKey = (id: number | null) =>
    id ? `narrative_history_${id}` : 'narrative_history_guest';

  // Auto-save settings when they change
  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    // Clear previous timeout
    if (settingsSaveTimeoutRef.current) {
      clearTimeout(settingsSaveTimeoutRef.current);
    }

    // Set new timeout - save after 500ms of no changes
    settingsSaveTimeoutRef.current = setTimeout(() => {
      fetch('/api/chronoread/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }).catch((error) => console.error('Error auto-saving settings:', error));
    }, 500);

    return () => {
      if (settingsSaveTimeoutRef.current) {
        clearTimeout(settingsSaveTimeoutRef.current);
      }
    };
  }, [settings, isAuthenticated, userId]);

  // Stop narration when leaving listen mode
  useEffect(() => {
    if (interactionMode !== "listen" && isNarrating) {
      handleStopNarration();
    }
  }, [interactionMode, isNarrating]);

  interface SpeechRecognitionLike {
    continuous?: boolean;
    interimResults?: boolean;
    lang?: string;
    onresult?: (event: { results: Array<Array<{ transcript: string }>> }) => void;
    onerror?: () => void;
    onend?: () => void;
    onstart?: () => void;
    start?: () => void;
    stop?: () => void;
  }

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const narrationAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const ambientMusicRef = useRef<{ oscillators: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null>(null);
  const interactionModeRef = useRef<"read" | "listen">("read");
  const isNarratingRef = useRef(false);
  const isMicMutedRef = useRef(false);
  const listenRequestPendingRef = useRef(false);
  const ttsSessionRef = useRef<string | null>(null);
  const activeNarrationKeyRef = useRef<string | null>(null);
  const lastNarrationRef = useRef<string>('');
  const lastListenQueryRef = useRef<string>('');
  const activeListenSessionIdRef = useRef<string | null>(null);
  const activeReadSessionIdRef = useRef<string | null>(null);
  const lastMicInterruptAtRef = useRef<number>(0);
  const lastListenTranscriptRef = useRef<string>('');
  const lastListenTranscriptAtRef = useRef<number>(0);
  const handleListenTranscriptRef = useRef<(transcript: string) => void>(() => {});
  const manualScrollUntilRef = useRef<number>(0); // Track manual scroll time to disable observer updates
  const userMessages = useMemo(() => messages.filter((msg) => msg.role === 'user'), [messages]);

  // NEW: Filter and sort history by tab (Chat/Voice) with recent first
  const filteredHistory = useMemo(() => {
    let filtered = [...history];
    
    // Filter by tab
    if (historyTab === "chat") {
      filtered = filtered.filter(item => item.interactionMode === "read");
    } else if (historyTab === "voice") {
      filtered = filtered.filter(item => item.interactionMode === "listen");
    }
    
    // Sort by timestamp - recent first
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return filtered;
  }, [history, historyTab]);

  // ============================================================================
  // CLEANUP: Stop narration when component unmounts or window closes
  // ============================================================================
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Stop any active narration when window/tab is closing
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch {}
        try { currentSourceRef.current.disconnect(); } catch {}
        currentSourceRef.current = null;
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
      }
      stopAmbientMusic();
    };

    // Listen for page unload/window closure
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Cleanup on component unmount
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Stop narration when component unmounts
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch {}
        try { currentSourceRef.current.disconnect(); } catch {}
        currentSourceRef.current = null;
      }
      stopAmbientMusic();
    };
  }, []);

  const startRecognition = (continuous: boolean) => {
    if (!recognitionRef.current) return;
    recognitionRef.current.continuous = continuous;
    recognitionRef.current.interimResults = false;
    try { recognitionRef.current.start?.(); } catch {}
  };

  const stopRecognition = () => {
    try { recognitionRef.current?.stop?.(); } catch {}
  };

  const setMicMuted = (muted: boolean) => {
    isMicMutedRef.current = muted;
    setIsMicMuted(muted);
  };

  // Initialize Speech Recognition
  useEffect(() => {
    type SpeechRecCtor = new () => SpeechRecognitionLike;
    const win = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
    const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (SpeechRecognitionCtor) {
      recognitionRef.current = new SpeechRecognitionCtor();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        if (isNarratingRef.current) {
          stopNarration();
        }
        if (interactionModeRef.current === "listen") {
          setListenStatus("listening");
        }
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (!transcript.trim()) return;
        if (interactionModeRef.current === "listen") {
          if (listenRequestPendingRef.current || isLoading) return;
          const now = performance.now();
          if (
            transcript.trim() === lastListenTranscriptRef.current &&
            now - lastListenTranscriptAtRef.current < 3000
          ) {
            return;
          }
          lastListenTranscriptRef.current = transcript.trim();
          lastListenTranscriptAtRef.current = now;
          if (isNarratingRef.current) stopNarration();
          void handleListenTranscriptRef.current(transcript.trim());
        } else {
          setInputValue(prev => prev ? `${prev} ${transcript}` : transcript);
        }
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        if (interactionModeRef.current === "listen") {
          if (listenRequestPendingRef.current || isNarratingRef.current || ttsSessionRef.current) {
            return;
          }
          if (!isMicMutedRef.current) {
            startRecognition(true);
            return;
          }
        }
        if (interactionModeRef.current !== "listen") {
          setMicMuted(true);
        }
      };
    }
  }, []);

  // Check authentication and load user settings
  useEffect(() => {
    if (status === 'loading') return;

    const loadLocalHistory = (id: number | null) => {
      const savedHistory = localStorage.getItem(getHistoryStorageKey(id));
      if (savedHistory) {
        setHistory(hydrateHistory(JSON.parse(savedHistory)));
      } else {
        setHistory([]);
      }
    };

    const migrateGuestHistory = (id: number) => {
      const guestKey = getHistoryStorageKey(null);
      const userKey = getHistoryStorageKey(id);
      const guestHistoryRaw = localStorage.getItem(guestKey);
      if (!guestHistoryRaw) return;

      const guestHistory = hydrateHistory(JSON.parse(guestHistoryRaw));
      const userHistoryRaw = localStorage.getItem(userKey);
      const userHistory = userHistoryRaw ? hydrateHistory(JSON.parse(userHistoryRaw)) : [];

      if (guestHistory.length === 0) return;

      const merged = [...guestHistory, ...userHistory].slice(0, 40);
      const deduped = merged.reduce<HistoryItem[]>((acc, item) => {
        if (!acc.find((entry) => entry.id === item.id)) acc.push(item);
        return acc;
      }, []).slice(0, 20);
      localStorage.setItem(userKey, JSON.stringify(deduped));
      localStorage.removeItem(guestKey);
      setHistory(deduped);
    };

    const checkAuthAndLoadSettings = async () => {
      try {
        const authRes = await fetch('/api/chronoread/auth-check', {
          cache: 'no-store',
          credentials: 'include',
        });
        const authData = await authRes.json();

        if (authData.authenticated && authData.user?.id) {
          setAuthCheckAuthenticated(true);
          setUserId(authData.user.id);
          loadLocalHistory(authData.user.id);
          migrateGuestHistory(authData.user.id);

          // Load user settings
          const settingsRes = await fetch('/api/chronoread/settings', {
            cache: 'no-store',
            credentials: 'include',
          });
          const settingsData = await settingsRes.json();
          if (settingsData.success && settingsData.settings) {
            const storedProvider = settingsData.settings.ttsProvider as TextToSpeechProvider | undefined;
            const resolvedProvider = storedProvider === TextToSpeechProvider.OPENAI
              ? TextToSpeechProvider.GOOGLE
              : Object.values(TextToSpeechProvider).includes(storedProvider as TextToSpeechProvider)
                ? (storedProvider as TextToSpeechProvider)
                : TextToSpeechProvider.GOOGLE;
            setSettings((prev) => ({
              ...prev,
              aiModel:
                settingsData.settings.aiModel === AIModel.OPENAI ||
                settingsData.settings.aiModel === AIModel.CLAUDE_SONNET ||
                settingsData.settings.aiModel === AIModel.GEMINI ||
                settingsData.settings.aiModel === AIModel.XAI ||
                settingsData.settings.aiModel === AIModel.AUTO
                  ? settingsData.settings.aiModel
                  : AIModel.AUTO,
              narrationType: settingsData.settings.narrationType || 'Realistic',
              voiceType: settingsData.settings.voiceType || DEFAULT_GOOGLE_VOICE,
              voiceGender: settingsData.settings.voiceGender || VoiceGender.AUTO,
              language: settingsData.settings.language || Language.ENGLISH,
              ttsProvider: resolvedProvider,
              enableBackgroundMusic: settingsData.settings.enableBackgroundMusic !== undefined ? settingsData.settings.enableBackgroundMusic : false,
              backgroundMusicVolume: settingsData.settings.backgroundMusicVolume || 0.15,
            }));

            if (storedProvider === TextToSpeechProvider.OPENAI) {
              fetch('/api/chronoread/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ttsProvider: TextToSpeechProvider.GOOGLE }),
              }).catch((error) => console.error('Error updating TTS provider default:', error));
            }
          }

          const profileRes = await fetch('/api/chronoread/profile', {
            cache: 'no-store',
            credentials: 'include',
          });
          const profileData = await profileRes.json();
          if (profileData.success && profileData.profile) {
            setUserProfile(profileData.profile);
          }

          // Load chat history
          const historyRes = await fetch('/api/chronoread/chat', {
            cache: 'no-store',
            credentials: 'include',
          });
          const historyData = await historyRes.json();
          if (historyData.success && historyData.history) {
            console.log('Chat history loaded:', historyData.history.length, 'messages');
          }
        } else {
          setAuthCheckAuthenticated(false);
          loadLocalHistory(null);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setAuthCheckAuthenticated(false);
        setUserProfile(null);
        loadLocalHistory(null);
      }
    };

    void checkAuthAndLoadSettings();
  }, [status, isSessionAuthenticated]);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
    if (interactionMode === "listen") {
      initAudio();
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      if (listenRequestPendingRef.current) {
        setListenStatus("thinking");
        stopRecognition();
        stopMicAnalyser();
        return;
      }
      if (isMicMutedRef.current) {
        setMicMuted(false);
      }
      if (!isMicMutedRef.current) {
        setListenStatus("listening");
        startMicAnalyser();
        setRecognitionLanguage();
        startRecognition(true);
      } else {
        setListenStatus("idle");
      }
    } else {
      stopRecognition();
      stopMicAnalyser();
      setListenStatus("idle");
      activeListenSessionIdRef.current = null;
    }
  }, [interactionMode]);

  useEffect(() => {
    let isActive = true;
    listGoogleVoices(settings.language)
      .then((voices) => {
        if (!isActive) return;
        setGoogleVoices(voices);
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, [settings.language]);

  const availableGoogleVoices = useMemo(
    () => filterVoicesByGender(googleVoices, settings.voiceGender),
    [googleVoices, settings.voiceGender]
  );

  useEffect(() => {
    if (!googleVoices.length) return;
    const candidates = availableGoogleVoices.length ? availableGoogleVoices : googleVoices;
    const nextVoice = candidates[0]?.name || DEFAULT_GOOGLE_VOICE;
    if (nextVoice && settings.voiceType !== nextVoice) {
      setSettings((prev) => ({
        ...prev,
        voiceType: nextVoice,
      }));
    }
  }, [googleVoices, availableGoogleVoices, settings.voiceType]);

  useEffect(() => {
    setRecognitionLanguage();
    if (interactionModeRef.current === "listen") {
      stopRecognition();
      startRecognition(true);
    }
  }, [settings.language]);

  const setRecognitionLanguageFor = (language: Language) => {
    const langMap: Record<Language, string> = {
      [Language.ENGLISH]: 'en-US',
      [Language.SPANISH]: 'es-ES',
      [Language.FRENCH]: 'fr-FR',
      [Language.GERMAN]: 'de-DE',
      [Language.CHINESE]: 'zh-CN',
      [Language.JAPANESE]: 'ja-JP',
      [Language.HINDI]: 'hi-IN',
      [Language.PORTUGUESE]: 'pt-PT',
      [Language.TAMIL]: 'ta-IN',
      [Language.TELUGU]: 'te-IN',
      [Language.MALAYALAM]: 'ml-IN',
      [Language.KANNADA]: 'kn-IN',
      [Language.BENGALI]: 'bn-IN',
      [Language.MARATHI]: 'mr-IN',
      [Language.GUJARATI]: 'gu-IN',
      [Language.PUNJABI]: 'pa-IN',
    };
    if (recognitionRef.current) recognitionRef.current.lang = langMap[language] || 'en-US';
  };

  const setRecognitionLanguage = () => {
    setRecognitionLanguageFor(settings.language);
  };

  const toggleMic = () => {
    // If currently in read mode, switch to listen mode
    if (interactionModeRef.current === "read") {
      stopNarrationForUiChange();
      resetListenSession();
      setMicMuted(false);
      setInteractionMode("listen");
      return;
    }

    // If in listen mode, handle mic mute/unmute
    if (interactionModeRef.current === "listen") {
      if (isMicMutedRef.current) {
        if (isNarratingRef.current) {
          stopNarration();
        }
        setMicMuted(false);
        setRecognitionLanguage();
        startMicAnalyser();
        startRecognition(true);
        setListenStatus("listening");
      } else {
        setMicMuted(true);
        stopRecognition();
        stopMicAnalyser();
        setListenStatus("idle");
      }
      return;
    }

    if (isListening) {
      setMicMuted(true);
      stopRecognition();
      return;
    }

    setMicMuted(false);
    setRecognitionLanguage();
    startRecognition(false);
  };

  const enterListenMode = () => {
    stopNarrationForUiChange();
    resetListenSession();
    setMicMuted(false);
    setInteractionMode("listen");
  };

  const initAudio = () => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      } catch {
        // Fallback: create without sampleRate
        audioContextRef.current = new AudioContext();
      }
    }
  };

  const startMicAnalyser = async () => {
    if (micStreamRef.current || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      initAudio();
      if (!audioContextRef.current) return;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      micStreamRef.current = stream;
      micAnalyserRef.current = analyser;
    } catch {
      // ignore mic errors
    }
  };

  const stopMicAnalyser = () => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
  };

  const stopAmbientMusic = () => {
    if (ambientMusicRef.current) {
      stopMusicService(ambientMusicRef.current);
    }
    ambientMusicRef.current = null;
  };

  const startAmbientMusic = async (genre?: Genre | string | null) => {
    if (!settings.enableBackgroundMusic) return;
    initAudio();
    if (!audioContextRef.current) return;
    
    stopAmbientMusic();
    const music = createAmbientMusicForGenre(
      audioContextRef.current,
      genre || Genre.DEFAULT,
      settings.backgroundMusicVolume
    );
    ambientMusicRef.current = music;
  };

  const getAnalyserLevel = (analyser: AnalyserNode | null) => {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  };

  const inferLanguageFromTranscript = (text: string): Language | null => {
    if (!text) return null;
    if (/[\u0B80-\u0BFF]/.test(text)) return Language.TAMIL;
    return null;
  };

  const cleanTextForTts = (raw: string) => {
    if (!raw) return '';
    let text = raw;
    text = text.replace(/```[\s\S]*?```/g, ' ');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '$1');
    text = text.replace(/^\s*#{1,6}\s+/gm, '');
    text = text.replace(/^\s*[-*+]\s+/gm, '');
    text = text.replace(/^\s*\d+[.)]\s+/gm, '');
    text = text.replace(/[\*_~]/g, '');

    const lines = text.split(/\r?\n/).filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      const pipeCount = (trimmed.match(/\|/g) || []).length;
      if (pipeCount >= 2) return false;
      if (/^[-:| ]+$/.test(trimmed)) return false;
      return true;
    });
    text = lines.join(' ');

    text = text.replace(/[\p{Extended_Pictographic}]/gu, '');
    text = text.replace(/[^\p{L}\p{M}\p{N}\s.,;:!?"'()\-]/gu, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  };

  const getTtsExcerpt = (text: string, _mode: "read" | "listen") => {
    const cleaned = cleanTextForTts(text);
    return cleaned || text;
  };

  const getNarrationStyleRate = (style: Settings["narrationType"]) => {
    if (style === "Dramatic") return 0.95;
    if (style === "Educational") return 0.98;
    return 1.0;
  };

  const getNarrationStylePitch = (style: Settings["narrationType"]) => {
    if (style === "Dramatic") return -2;
    if (style === "Educational") return 0;
    return -1;
  };

  const dedupeHistory = (items: HistoryItem[]) => {
    const seen = new Set<string>();
    const deduped: HistoryItem[] = [];
    for (const item of items) {
      if (!item?.id) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      deduped.push(item);
    }
    return deduped;
  };

  const hydrateHistory = (items: HistoryItem[]) => {
    const mapped = items.map((item) => ({
      ...item,
      timestamp: new Date(item.timestamp),
      interactionMode: item.interactionMode || "read",
      conversation: item.conversation?.map((entry) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      })),
    }));
    return dedupeHistory(mapped);
  };

  const persistHistory = (items: HistoryItem[]) => {
    const buildPayload = (options: { maxItems: number; maxResponseChars: number; includeFullConversation: boolean }) => {
      return items.slice(0, options.maxItems).map((item) => {
        const isListen = item.interactionMode === "listen";
        // ALWAYS preserve full conversation to prevent data loss on refresh
        const conversation = options.includeFullConversation
          ? item.conversation // Keep all messages, never slice
          : undefined;
        const responseLimit = isListen
          ? Math.max(options.maxResponseChars, 8000)
          : options.maxResponseChars;

        return {
          ...item,
          audioBlob: undefined,
          response: conversation
            ? undefined
            : item.response && item.response.length > responseLimit
              ? item.response.slice(0, responseLimit)
              : item.response,
          conversation,
        };
      });
    };

    const attempts = [
      { maxItems: 20, maxResponseChars: 6000, includeFullConversation: true }, // Always try to preserve full convos
      { maxItems: 12, maxResponseChars: 4000, includeFullConversation: true }, // Still preserve full convos
      { maxItems: 8, maxResponseChars: 3000, includeFullConversation: true }, // Still preserve full convos
      { maxItems: 6, maxResponseChars: 2000, includeFullConversation: false }, // Only fallback to no convos at extreme quota
    ];

    for (const attempt of attempts) {
      try {
        localStorage.setItem(getHistoryStorageKey(userId), JSON.stringify(buildPayload(attempt)));
        return;
      } catch {}
    }
  };

  const resetMessageUiState = useCallback(() => {
    if (typewriterFrameRef.current) {
      window.cancelAnimationFrame(typewriterFrameRef.current);
      typewriterFrameRef.current = null;
    }
    setTypewriterState({ messageId: null, text: '' });
    setCompletedTypewriterMap({});
    userMessageRefs.current = {};
    pendingScrollUserIdRef.current = null;
    activeRequestIdRef.current = null;
    activeTypewriterMessageRef.current = null;
    setActiveRequestId(null);
  }, []);

  const markAssistantMessageCompleted = useCallback((id: string) => {
    setCompletedTypewriterMap((prev) => {
      if (prev[id]) return prev;
      return { ...prev, [id]: true };
    });
  }, []);

  const scrollToMessage = useCallback((id: string) => {
    const node = userMessageRefs.current[id];
    const container = readScrollContainerRef.current;
    
    if (!node || !container) {
      pendingScrollUserIdRef.current = id;
      return;
    }

    // Set flag to prevent Intersection Observer from interfering for 600ms
    manualScrollUntilRef.current = Date.now() + 600;

    // Scroll within the read container only, not the whole page
    const nodeTop = node.offsetTop;
    const nodeHeight = node.offsetHeight;
    const containerHeight = container.clientHeight;
    const targetScroll = nodeTop - (containerHeight / 2) + (nodeHeight / 2);

    container.scrollTo({ top: targetScroll, behavior: 'smooth' });
    
    // Update active request ID
    activeRequestIdRef.current = id;
    setActiveRequestId(id);
  }, []);

  const registerUserMessageNode = (id: string, node: HTMLDivElement | null) => {
    if (node) {
      userMessageRefs.current[id] = node;
      if (pendingScrollUserIdRef.current === id) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pendingScrollUserIdRef.current = null;
        activeRequestIdRef.current = id;
        setActiveRequestId(id);
      }
      return;
    }
    delete userMessageRefs.current[id];
  };

  const startTypewriter = useCallback((message: ChatMessage) => {
    if (!message.animate) {
      markAssistantMessageCompleted(message.id);
      return;
    }

    if (typewriterFrameRef.current) {
      window.cancelAnimationFrame(typewriterFrameRef.current);
      typewriterFrameRef.current = null;
    }

    activeTypewriterMessageRef.current = message.id;
    setTypewriterState({ messageId: message.id, text: '' });
    const fullText = message.content;
    if (!fullText.length) {
      markAssistantMessageCompleted(message.id);
      activeTypewriterMessageRef.current = null;
      setTypewriterState({ messageId: null, text: '' });
      return;
    }

    const msPerChar = 1000 / TYPEWRITER_CHARS_PER_SECOND;
    const start = performance.now();

    const tick = (now: number) => {
      if (activeTypewriterMessageRef.current !== message.id) return;

      const elapsed = now - start;
      const nextIndex = Math.min(fullText.length, Math.max(1, Math.floor(elapsed / msPerChar)));
      setTypewriterState({ messageId: message.id, text: fullText.slice(0, nextIndex) });

      if (nextIndex < fullText.length) {
        typewriterFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      markAssistantMessageCompleted(message.id);
      activeTypewriterMessageRef.current = null;
      typewriterFrameRef.current = null;
      setTypewriterState({ messageId: null, text: '' });
    };

    typewriterFrameRef.current = window.requestAnimationFrame(tick);
  }, [markAssistantMessageCompleted]);

  useEffect(() => {
    return () => {
      if (typewriterFrameRef.current) {
        window.cancelAnimationFrame(typewriterFrameRef.current);
        typewriterFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!messages.length) return;
    setCompletedTypewriterMap((prev) => {
      let changed = false;
      const next = { ...prev };
      messages.forEach((msg) => {
        if (msg.role === 'assistant' && (!msg.animate || interactionMode !== 'read')) {
          if (!next[msg.id]) {
            next[msg.id] = true;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [messages, interactionMode]);

  useEffect(() => {
    if (interactionMode !== 'read') return;
    const nextMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === 'assistant' && msg.animate && !completedTypewriterMap[msg.id]);
    if (!nextMessage) return;
    if (activeTypewriterMessageRef.current === nextMessage.id) return;
    startTypewriter(nextMessage);
  }, [messages, interactionMode, completedTypewriterMap, startTypewriter]);

  useEffect(() => {
    if (interactionMode === 'read') return;
    if (typewriterFrameRef.current) {
      window.cancelAnimationFrame(typewriterFrameRef.current);
      typewriterFrameRef.current = null;
    }
    if (activeTypewriterMessageRef.current) {
      markAssistantMessageCompleted(activeTypewriterMessageRef.current);
    }
    activeTypewriterMessageRef.current = null;
    setTypewriterState({ messageId: null, text: '' });
  }, [interactionMode, markAssistantMessageCompleted]);

  useEffect(() => {
    if (interactionMode !== 'read') return;
    if (!messages.length) {
      activeRequestIdRef.current = null;
      setActiveRequestId(null);
      return;
    }
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') return;
    scrollToMessage(lastMessage.id);
  }, [messages, interactionMode, scrollToMessage]);

  useEffect(() => {
    if (interactionMode !== 'read') return;
    const container = readScrollContainerRef.current;
    if (!container || userMessages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Don't update if we're in manual scroll mode
        if (Date.now() < manualScrollUntilRef.current) {
          return;
        }

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          const nextId = visible[0].target.getAttribute('data-message-id');
          if (nextId && nextId !== activeRequestIdRef.current) {
            activeRequestIdRef.current = nextId;
            setActiveRequestId(nextId);
          }
          return;
        }

        const fallback = entries
          .map((entry) => {
            const id = entry.target.getAttribute('data-message-id');
            if (!id) return null;
            const distance = Math.abs(
              entry.boundingClientRect.top -
                (container.getBoundingClientRect().top + container.clientHeight * 0.25)
            );
            return { id, distance };
          })
          .filter(Boolean) as { id: string; distance: number }[];
        if (!fallback.length) return;
        fallback.sort((a, b) => a.distance - b.distance);
        const nextId = fallback[0].id;
        if (nextId && nextId !== activeRequestIdRef.current) {
          activeRequestIdRef.current = nextId;
          setActiveRequestId(nextId);
        }
      },
      { root: container, threshold: [0.25, 0.5, 0.75] }
    );

    userMessages.forEach((msg) => {
      const node = userMessageRefs.current[msg.id];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [userMessages, interactionMode]);

  useEffect(() => {
    const tick = () => {
      const micLevel = getAnalyserLevel(micAnalyserRef.current);
      const narrationLevel = getAnalyserLevel(narrationAnalyserRef.current);
      if (
        interactionModeRef.current === "listen" &&
        isNarratingRef.current &&
        !isMicMutedRef.current &&
        !listenRequestPendingRef.current
      ) {
        const now = performance.now();
        const micDominant = micLevel > 0.08 && micLevel > narrationLevel * 1.2;
        if (micDominant && now - lastMicInterruptAtRef.current > 1500) {
          lastMicInterruptAtRef.current = now;
          handleStopNarration();
          setRecognitionLanguage();
          startRecognition(true);
        }
      }
      const combined = Math.min(1, micLevel * 2.2 + narrationLevel * 2.6);
      setPulse(combined);
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const upsertHistoryItem = (item: HistoryItem) => {
    setHistory((prev) => {
      let updated: HistoryItem[] = [];
      const remaining = prev.filter((entry) => entry.id !== item.id);
      updated = [item, ...remaining];
      const trimmed = dedupeHistory(updated).slice(0, 20);
      persistHistory(trimmed);
      return trimmed;
    });
  };

  const handlePlayAudio = async (base64: string, options?: { listenMode?: boolean; genre?: string | null }) => {
    initAudio();
    if (!audioContextRef.current) return;
    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch {}
    }

    try { window.speechSynthesis.cancel(); } catch {}

    // Stop any previously playing source
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {};
      try { currentSourceRef.current.disconnect(); } catch {}
      currentSourceRef.current = null;
    }

    const data = decodeAudio(base64);
    const buffer = await getAudioBuffer(data, audioContextRef.current);
    const source = audioContextRef.current.createBufferSource();
    const analyser = audioContextRef.current.createAnalyser();
    analyser.fftSize = 512;
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(audioContextRef.current.destination);
    source.start(0);
    currentSourceRef.current = source;
    narrationAnalyserRef.current = analyser;
    isNarratingRef.current = true;
    setIsNarrating(true);

    if (options?.listenMode) {
      setListenStatus("narrating");
      startAmbientMusic(options.genre || null);
    }

    source.onended = () => {
      isNarratingRef.current = false;
      setIsNarrating(false);
      narrationAnalyserRef.current = null;
      stopAmbientMusic();
      if (interactionModeRef.current === "listen") {
        setListenStatus(isMicMutedRef.current ? "idle" : "listening");
      }
    };
  };

  const splitTextForTts = (value: string, maxChunkLength = 600) => {
    const sentences = value.match(/[^.!?\n]+[.!?]?/g) || [value];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if (!sentence) continue;
      if ((current + ' ' + sentence).trim().length > maxChunkLength) {
        if (current) chunks.push(current.trim());
        current = sentence;
      } else {
        current = `${current} ${sentence}`.trim();
      }
    }

    if (current) chunks.push(current.trim());
    return chunks.length ? chunks : [value];
  };

  const playAudioChunk = async (base64: string) => {
    initAudio();
    if (!audioContextRef.current) return;
    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch {}
    }

    try { window.speechSynthesis.cancel(); } catch {}

    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {}
      try { currentSourceRef.current.disconnect(); } catch {}
      currentSourceRef.current = null;
    }

    const data = decodeAudio(base64);
    const buffer = await getAudioBuffer(data, audioContextRef.current);
    const source = audioContextRef.current.createBufferSource();
    const analyser = audioContextRef.current.createAnalyser();
    analyser.fftSize = 512;
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(audioContextRef.current.destination);
    source.start(0);
    currentSourceRef.current = source;
    narrationAnalyserRef.current = analyser;

    await new Promise<void>((resolve) => {
      source.onended = () => {
        narrationAnalyserRef.current = null;
        currentSourceRef.current = null;
        resolve();
      };
    });
  };

  const playTtsInChunks = async (
    text: string,
    voiceProfile?: VoiceProfile,
    options?: { listenMode?: boolean; genre?: string | null; onStart?: () => void; onFinish?: () => void }
  ): Promise<'completed' | 'canceled' | 'failed' | 'timeout'> => {
    const chunks = splitTextForTts(text, 600);
    const sessionId = Math.random().toString(36).slice(2, 10);
    ttsSessionRef.current = sessionId;
    isNarratingRef.current = true;
    setIsNarrating(true);

    const chunkTimeoutMs = 8000;
    const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('TTS timeout')), ms);
        promise
          .then((result) => {
            clearTimeout(timer);
            resolve(result);
          })
          .catch((error) => {
            clearTimeout(timer);
            reject(error);
          });
      });

    let hasStartedNarration = false;

    try {
      for (const chunk of chunks) {
        if (ttsSessionRef.current !== sessionId) return 'canceled';
        let audioBase64 = '';
        try {
          audioBase64 = await withTimeout(generateNarrationAudio(chunk, voiceProfile), chunkTimeoutMs);
        } catch (error) {
          if (error instanceof Error && error.message === 'TTS timeout') {
            return 'timeout';
          }
          throw error;
        }
        if (!audioBase64) throw new Error('Empty TTS audio chunk');
        if (!hasStartedNarration) {
          hasStartedNarration = true;
          options?.onStart?.();
          if (options?.listenMode) {
            stopRecognition();
            setListenStatus('narrating');
            startAmbientMusic(options.genre || null);
          }
        }
        await playAudioChunk(audioBase64);
      }
    } catch (error) {
      console.error('Chunked TTS failed:', error);
      return 'failed';
    } finally {
      if (ttsSessionRef.current === sessionId) {
        ttsSessionRef.current = null;
      }
      isNarratingRef.current = false;
      setIsNarrating(false);
      stopAmbientMusic();
      options?.onFinish?.();
      if (options?.listenMode) {
        setListenStatus(isMicMutedRef.current ? 'idle' : 'listening');
        if (!isMicMutedRef.current && !listenRequestPendingRef.current) {
          setRecognitionLanguage();
          startRecognition(true);
        }
      }
    }

    return 'completed';
  };

  /**
   * Generate speech using the configured TTS provider (Google, OpenAI, or ElevenLabs)
   */
  const toVoiceNarrationType = (
    profile: VoiceProfile | undefined,
    fallback: Settings["narrationType"]
  ): Settings["narrationType"] => {
    if (!profile?.tone) return fallback;
    if (profile.tone === "intense") return "Dramatic";
    if (profile.tone === "calm") return "Educational";
    return fallback;
  };

  const getTtsProviderOrder = (provider: TextToSpeechProvider) => {
    if (provider === TextToSpeechProvider.GOOGLE) {
      return [TextToSpeechProvider.GOOGLE, TextToSpeechProvider.ELEVENLABS];
    }
    if (provider === TextToSpeechProvider.ELEVENLABS) {
      return [TextToSpeechProvider.ELEVENLABS, TextToSpeechProvider.GOOGLE];
    }
    if (provider === TextToSpeechProvider.OPENAI) {
      return [TextToSpeechProvider.OPENAI];
    }
    return [TextToSpeechProvider.GOOGLE, TextToSpeechProvider.ELEVENLABS];
  };

  const generateNarrationAudio = async (text: string, voiceProfile?: VoiceProfile): Promise<string> => {
    const effectiveNarrationType = toVoiceNarrationType(voiceProfile, settings.narrationType);
    const providerOrder = getTtsProviderOrder(settings.ttsProvider);
    const googleLanguageCode = getGoogleLanguageCode(settings.language);
    const baseRate = getNarrationStyleRate(effectiveNarrationType);
    const paceMultiplier = voiceProfile?.pace === 'fast' ? 1.12 : voiceProfile?.pace === 'slow' ? 0.92 : 1.0;
    const slangMultiplier = voiceProfile?.slang === 'moderate' ? 1.04 : voiceProfile?.slang === 'light' ? 1.02 : 1.0;
    const paceRate = Math.max(0.7, Math.min(1.3, baseRate * paceMultiplier * slangMultiplier));
    const basePitch = getNarrationStylePitch(effectiveNarrationType);
    const profilePitch = voiceProfile?.pitch === 'high' ? 2 : voiceProfile?.pitch === 'low' ? -4 : 0;
    const pitchValue = Math.max(-8, Math.min(8, basePitch + profilePitch));
    const resolvedGoogleVoice = resolveGoogleVoice(googleVoices, settings.voiceType, settings.voiceGender);
    const googleVoiceName =
      resolvedGoogleVoice?.name ||
      (settings.voiceType?.startsWith(googleLanguageCode) ? settings.voiceType : `${googleLanguageCode}-Standard-A`) ||
      DEFAULT_GOOGLE_VOICE;
    const googleRate = settings.language === Language.ENGLISH
      ? paceRate
      : Math.max(0.7, Math.min(1.1, paceRate * 0.9));

    for (const provider of providerOrder) {
      if (provider === TextToSpeechProvider.GOOGLE) {
        try {
          const googleAudio = await generateSpeechWithGoogle(
            text,
            googleVoiceName,
            googleLanguageCode,
            googleRate,
            pitchValue
          );
          if (googleAudio) return googleAudio;
        } catch (error) {
          console.warn('Google TTS failed:', error);
        }
      }

      if (provider === TextToSpeechProvider.ELEVENLABS) {
        try {
          const elevenLabsAudio = await generateSpeechWithElevenLabs(
            text,
            settings.voiceType,
            settings.language,
            effectiveNarrationType,
            settings.voiceGender
          );
          if (elevenLabsAudio) return elevenLabsAudio;
        } catch (error) {
          console.warn('ElevenLabs TTS failed:', error);
        }
      }

      if (provider === TextToSpeechProvider.OPENAI) {
        try {
          const openAIAudio = await generateSpeech(text, settings.voiceType, settings.language);
          if (openAIAudio) return openAIAudio;
        } catch (error) {
          console.warn('OpenAI TTS failed:', error);
        }
      }
    }

    return '';
  };

  const playBrowserTTS = (
    text: string,
    options?: { listenMode?: boolean; genre?: string | null; onComplete?: () => void; voiceProfile?: VoiceProfile }
  ) => {
    if (!('speechSynthesis' in window)) {
      throw new Error('Browser speech synthesis is not supported on this device.');
    }

    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {};
      try { currentSourceRef.current.disconnect(); } catch {}
      currentSourceRef.current = null;
    }

    const synth = window.speechSynthesis;
    const languageMap: Record<string, string> = {
      ENGLISH: 'en-US',
      SPANISH: 'es-ES',
      FRENCH: 'fr-FR',
      GERMAN: 'de-DE',
      PORTUGUESE: 'pt-PT',
      HINDI: 'hi-IN',
      TAMIL: 'ta-IN',
      TELUGU: 'te-IN',
      KANNADA: 'kn-IN',
      MALAYALAM: 'ml-IN',
      BENGALI: 'bn-IN',
      MARATHI: 'mr-IN',
      GUJARATI: 'gu-IN',
      PUNJABI: 'pa-IN',
      CHINESE: 'zh-CN',
      JAPANESE: 'ja-JP',
      ARABIC: 'ar-SA',
      HEBREW: 'he-IL',
    };

    const effectiveNarrationType = toVoiceNarrationType(options?.voiceProfile, settings.narrationType);
    const baseRate = getNarrationStyleRate(effectiveNarrationType);
    const paceMultiplier = options?.voiceProfile?.pace === 'fast' ? 1.12 : options?.voiceProfile?.pace === 'slow' ? 0.92 : 1.0;
    const slangMultiplier = options?.voiceProfile?.slang === 'moderate' ? 1.04 : options?.voiceProfile?.slang === 'light' ? 1.02 : 1.0;
    const computedRate = Math.max(0.7, Math.min(1.3, baseRate * paceMultiplier * slangMultiplier));
    const basePitch = getNarrationStylePitch(effectiveNarrationType);
    const profilePitch = options?.voiceProfile?.pitch === 'high' ? 0.15 : options?.voiceProfile?.pitch === 'low' ? -0.15 : 0;
    const computedPitch = Math.max(0.6, Math.min(1.4, 1 + (basePitch + profilePitch) / 10));

    const chunks = splitTextForTts(text, 1200);
    const lang = languageMap[settings.language] || 'en-US';
    let chunkIndex = 0;
    let started = false;
    let hasStartedNarration = false;

    const pickVoice = () => {
      const voices = synth.getVoices();
      if (!voices.length) return null;
      const exact = voices.find((voice) => voice.lang === lang);
      if (exact) return exact;
      const partial = voices.find((voice) => voice.lang.startsWith(lang.split('-')[0] || ''));
      return partial || voices[0] || null;
    };

    const finish = () => {
      isNarratingRef.current = false;
      setIsNarrating(false);
      stopAmbientMusic();
      if (options?.listenMode) {
        setListenStatus(isMicMutedRef.current ? 'idle' : 'listening');
        if (!isMicMutedRef.current && !listenRequestPendingRef.current) {
          setRecognitionLanguage();
          startRecognition(true);
        }
      }
      options?.onComplete?.();
    };

    const speakNext = () => {
      if (started) return;
      started = true;
      const voice = pickVoice();
      if (!voice && synth.getVoices().length === 0) {
        started = false;
        return;
      }

      if (chunkIndex >= chunks.length) {
        finish();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utterance.lang = lang;
      utterance.rate = computedRate;
      utterance.pitch = computedPitch;
      utterance.volume = 0.9;
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onend = () => {
        started = false;
        chunkIndex += 1;
        speakNext();
      };

      utterance.onerror = () => {
        started = false;
        finish();
      };

      if (!hasStartedNarration && options?.listenMode) {
        hasStartedNarration = true;
        stopRecognition();
        setListenStatus('narrating');
        startAmbientMusic(options.genre || null);
      }
      synth.speak(utterance);
    };

    isNarratingRef.current = true;
    setIsNarrating(true);

    synth.cancel();

    if (!synth.getVoices().length) {
      synth.onvoiceschanged = () => {
        synth.onvoiceschanged = null;
        speakNext();
      };
    }

    speakNext();
  };


  const stopNarration = () => {
    ttsSessionRef.current = null;
    activeNarrationKeyRef.current = null;
    setActiveNarrationKey(null);
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {};
      try { currentSourceRef.current.disconnect(); } catch {}
      currentSourceRef.current = null;
    }
    narrationAnalyserRef.current = null;
    stopAmbientMusic();
    isNarratingRef.current = false;
    setIsNarrating(false);
    try { window.speechSynthesis.cancel(); } catch {}
  };

  const handleStopNarration = () => {
    stopNarration();
    if (interactionModeRef.current === "listen") {
      setListenStatus(isMicMutedRef.current ? "idle" : "listening");
    }
  };

  const stopNarrationForUiChange = useCallback(() => {
    if (isNarratingRef.current) {
      handleStopNarration();
    }
  }, [handleStopNarration]);

  useEffect(() => {
    if (interactionModeRef.current !== "listen") return;
    stopNarration();
    listenRequestPendingRef.current = false;
    ttsSessionRef.current = null;
    if (!isMicMutedRef.current) {
      setListenStatus("listening");
      setRecognitionLanguage();
      startRecognition(true);
    } else {
      setListenStatus("idle");
    }
  }, [settings.narrationType]);

  const stopAndReturnToRead = () => {
    handleStopNarration();
    setInteractionMode("read");
  };

  const resetListenSession = () => {
    activeListenSessionIdRef.current = null;
    lastNarrationRef.current = '';
    lastListenQueryRef.current = '';
    setSelectedHistory(null);
    setSelectedHistoryId(null);
  };

  const startNewChatSession = useCallback(() => {
    resetMessageUiState();
    stopNarrationForUiChange();
    activeReadSessionIdRef.current = null;
    setMessages([]);
    setInputValue('');
    setReadSuggestions([]);
    setSelectedHistory(null);
    setSelectedHistoryId(null);
    setIsMobileJumpOpen(false);
  }, [resetMessageUiState, stopNarrationForUiChange]);

  const isGenericQuery = (value: string) => {
    const cleaned = value.trim().toLowerCase();
    if (!cleaned) return true;
    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 3) return true;
    const bookKeywords = [
      'book', 'novel', 'author', 'chapter', 'isbn', 'publisher', 'bestseller', 'biography', 'memoir',
    ];
    return !bookKeywords.some((keyword) => cleaned.includes(keyword));
  };

  const resolveSearchMode = (query: string, currentMode: SearchMode) => {
    if (currentMode === SearchMode.BOOK && isGenericQuery(query)) {
      return SearchMode.CASE_STUDY;
    }
    return currentMode;
  };

  const shouldSwitchFromBookResponse = (text: string) => {
    const lowered = text.toLowerCase();
    return (
      lowered.includes('no relevant books') ||
      lowered.includes('no specific book') ||
      lowered.includes('could not find') ||
      lowered.includes("couldn't find") ||
      lowered.includes('not a known book')
    );
  };

  const deleteHistoryItem = (id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      persistHistory(updated);
      return updated;
    });
    if (selectedHistoryId === id) {
      setSelectedHistoryId(null);
      setSelectedHistory(null);
    }
  };

  const sanitizeNarrationForDisplay = (text: string) => {
    const withoutMetadata = text
      .replace(/Suggested\s+Next\s+Topics?:[\s\S]*$/gi, '')
      .replace(/Suggested\s+next:[\s\S]*$/gi, '')
      .replace(/Voice\s+Profile:[\s\S]*$/gi, '')
      .replace(/\r\n/g, '\n');

    return withoutMetadata.trim();
  };

  /**
   * Clean excessive blank lines before tables, headings, and code blocks
   * CRITICAL: Remove ALL spacing issues around markdown separators
   */
  const cleanExcessiveWhitespace = (text: string): string => {
    let cleaned = text;

    // Collapse ALL excessive newlines (5+) to single newline
    cleaned = cleaned.replace(/\n{5,}/g, '\n');
    
    // Remove blank lines before structural elements
    // Before bold text or headings
    cleaned = cleaned.replace(/\n\n+(?=\*\*|#{1,6}\s)/g, '\n');
    
    // Before code blocks
    cleaned = cleaned.replace(/\n\n+(?=```)/g, '\n');
    
    // Before lists
    cleaned = cleaned.replace(/\n\n+(?=[-*\+]\s)/g, '\n');
    
    // Remove triple+ newlines anywhere (allows max 1 blank line)
    cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');
    
    // Remove leading/trailing whitespace
    cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');
    
    return cleaned;
  };

  const getAssistantDisplayContent = (msg: ChatMessage) => {
    if (msg.role !== 'assistant') return msg.content;
    if (!msg.animate) {
      // Clean excessive whitespace on static display
      return cleanExcessiveWhitespace(msg.content);
    }
    if (completedTypewriterMap[msg.id]) {
      return cleanExcessiveWhitespace(msg.content);
    }
    if (typewriterState.messageId === msg.id) return typewriterState.text;
    return cleanExcessiveWhitespace(msg.content);
  };

  const buildSuggestionFallback = (query: string) => {
    const base = query.trim();
    if (!base) {
      return ['Key takeaways', 'Real-world example', 'What to do next'];
    }
    return [
      `Key takeaways from ${base}`,
      `Real-world angle on ${base}`,
      `Next steps for ${base}`,
    ];
  };

  const extractSuggestionsFromText = (text: string) => {
    const markers = [...text.matchAll(/Suggested\s+Next\s+Topics?:|Suggested\s+next:/gi)];
    if (markers.length === 0) {
      return { suggestions: [] as string[], cleanedText: text };
    }

    const suggestions: string[] = [];
    const firstMarkerIndex = markers[0].index ?? text.length;
    const cleanedText = text.slice(0, firstMarkerIndex).trim();

    for (let i = 0; i < markers.length; i++) {
      const start = (markers[i].index ?? 0) + markers[i][0].length;
      const nextMarkerIndex = i + 1 < markers.length ? (markers[i + 1].index ?? text.length) : text.length;
      const segment = text.slice(start, nextMarkerIndex).split(/Voice\s+Profile:/i)[0].trim();
      if (!segment) continue;

      const piped = segment
        .split('|')
        .map((item) => item.replace(/^[\s\-•\d.)]+/, '').trim())
        .filter(Boolean);

      if (piped.length > 1) {
        piped.forEach((item) => {
          if (!suggestions.includes(item)) suggestions.push(item);
        });
        continue;
      }

      const dashedMatches = [...segment.matchAll(/(?:^|\s)-\s*([^\n-][^\n]*?)(?=(?:\s+-\s)|$)/g)];
      if (dashedMatches.length > 0) {
        dashedMatches.forEach((match) => {
          const value = (match[1] || '').trim();
          if (value && !suggestions.includes(value)) suggestions.push(value);
        });
        continue;
      }

      const single = segment.replace(/^[\s\-•\d.)]+/, '').trim();
      if (single && !suggestions.includes(single)) suggestions.push(single);
    }

    return {
      suggestions: suggestions.filter((item) => item.length > 2).slice(0, 6),
      cleanedText,
    };
  };

  const parseResponseMetadata = (text: string) => {
    const extracted = extractSuggestionsFromText(text);
    const suggestions: string[] = [...extracted.suggestions];
    const voiceProfile: VoiceProfile = {};
    const lines = extracted.cleanedText.split(/\r?\n/).map((line) => line.trimEnd());
    const remainingLines: string[] = [];
    let inSuggestionBlock = false;

    const collectSuggestions = (raw: string) => {
      const normalized = raw
        .replace(/^[-•\d\.)\s]+/, '') // Remove leading numbers, dashes, bullets
        .replace(/[\*_`~]/g, '') // Remove formatting
        .trim();
      if (!normalized) return;

      const pipeSplit = normalized.split('|').map((item) => item.trim()).filter(Boolean);
      const hyphenSplit = pipeSplit.length === 1
        ? normalized.split(/\s-\s+/).map((item) => item.trim()).filter(Boolean)
        : [];
      const values = (pipeSplit.length > 1 ? pipeSplit : hyphenSplit.length > 1 ? hyphenSplit : [normalized]).slice(0, 6);
      values.forEach((value) => {
        // Remove any leading numbers/dashes/bullets from individual suggestions
        const cleanedValue = value.replace(/^[\d.):-]+\s*/, '').trim();
        if (!suggestions.includes(cleanedValue) && cleanedValue.length > 0) {
          suggestions.push(cleanedValue);
        }
      });
    };

    for (const line of lines) {
      const plainLine = line.replace(/[\*_`~]/g, '').trim();

      if (inSuggestionBlock) {
        if (!plainLine) {
          continue;
        }
        const voiceProfileMatch = plainLine.match(/^Voice\s+Profile:\s*(.+)$/i);
        if (voiceProfileMatch?.[1]) {
          voiceProfileMatch[1]
            .split(';')
            .map((part) => part.trim())
            .forEach((part) => {
              const [rawKey, ...rawValue] = part.split('=');
              const key = (rawKey || '').trim().toLowerCase();
              const value = rawValue.join('=').trim();
              if (!value) return;
              if (key === 'genre') voiceProfile.genre = value;
              if (key === 'tone' && ['calm', 'neutral', 'intense'].includes(value)) voiceProfile.tone = value as VoiceProfile['tone'];
              if (key === 'pace' && ['slow', 'medium', 'fast'].includes(value)) voiceProfile.pace = value as VoiceProfile['pace'];
              if (key === 'pitch' && ['low', 'medium', 'high'].includes(value)) voiceProfile.pitch = value as VoiceProfile['pitch'];
              if (key === 'slang' && ['none', 'light', 'moderate'].includes(value)) voiceProfile.slang = value as VoiceProfile['slang'];
            });
          inSuggestionBlock = false;
          continue;
        }

        if (/^[A-Za-z][A-Za-z\s&/\-]{2,40}:$/.test(plainLine)) {
          inSuggestionBlock = false;
          remainingLines.push(line);
          continue;
        }

        collectSuggestions(plainLine);
        continue;
      }

      const suggestionMatch = plainLine.match(/^Suggested\s+Next\s+Topics?:\s*(.*)$/i) || plainLine.match(/^Suggested\s+next:\s*(.*)$/i);
      if (suggestionMatch) {
        collectSuggestions(suggestionMatch[1] || '');
        inSuggestionBlock = true;
        continue;
      }

      const voiceProfileMatch = plainLine.match(/^Voice\s+Profile:\s*(.+)$/i);
      if (voiceProfileMatch?.[1]) {
        voiceProfileMatch[1]
          .split(';')
          .map((part) => part.trim())
          .forEach((part) => {
            const [rawKey, ...rawValue] = part.split('=');
            const key = (rawKey || '').trim().toLowerCase();
            const value = rawValue.join('=').trim();
            if (!value) return;
            if (key === 'genre') voiceProfile.genre = value;
            if (key === 'tone' && ['calm', 'neutral', 'intense'].includes(value)) voiceProfile.tone = value as VoiceProfile['tone'];
            if (key === 'pace' && ['slow', 'medium', 'fast'].includes(value)) voiceProfile.pace = value as VoiceProfile['pace'];
            if (key === 'pitch' && ['low', 'medium', 'high'].includes(value)) voiceProfile.pitch = value as VoiceProfile['pitch'];
            if (key === 'slang' && ['none', 'light', 'moderate'].includes(value)) voiceProfile.slang = value as VoiceProfile['slang'];
          });
        continue;
      }

      remainingLines.push(line);
    }

    return {
      cleanedText: sanitizeNarrationForDisplay(remainingLines.join('\n')),
      suggestions,
      voiceProfile,
    };
  };

  const submitQuery = async (query: string, attachments: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    base64?: string;
    tool: string;
  }> = []) => {
    if (!query.trim() || isLoading) return;

    initAudio();
    const userQuery = query;
    const resolvedMode = resolveSearchMode(userQuery, searchMode);
    if (resolvedMode !== searchMode) {
      setSearchMode(resolvedMode);
    }
    const currentMode = resolvedMode;
    let historyId = activeReadSessionIdRef.current;
    if (!historyId) {
      historyId = Math.random().toString(36).substr(2, 9);
      activeReadSessionIdRef.current = historyId;
    }
    const requestTimestamp = new Date();
    setInputValue('');

    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userQuery,
      timestamp: requestTimestamp,
      mode: currentMode,
      attachments: attachments.length > 0 ? attachments.map(f => ({
        name: f.name,
        type: f.type,
        data: f.base64,
        size: f.size,
      })) : undefined,
      imageConfig: selectedTool === 'image' ? JSON.parse(sessionStorage.getItem('imageConfig') || '{}') : undefined,
      videoConfig: selectedTool === 'video' ? JSON.parse(sessionStorage.getItem('videoConfig') || '{}') : undefined,
    };

    setMessages(prev => [...prev, newUserMsg]);
    setSelectedHistoryId(historyId);
    setSelectedHistory(null);

    const existingItem = history.find((entry) => entry.id === historyId);
    const existingConversation: HistoryConversationEntry[] = existingItem?.conversation?.map((entry) => ({
      ...entry,
      role: entry.role as 'user' | 'assistant',
    })) || [];

    const pendingHistoryItem: HistoryItem = {
      id: historyId,
      query: existingItem?.query || userQuery,
      mode: currentMode,
      interactionMode: "read",
      timestamp: requestTimestamp,
      response: undefined,
      audioBlob: undefined,
      modelUsed: existingItem?.modelUsed,
      suggestions: existingItem?.suggestions,
      conversation: [...existingConversation, { role: 'user', content: userQuery, timestamp: requestTimestamp }],
    };
    upsertHistoryItem(pendingHistoryItem);

    if (isAuthenticated) {
      fetch('/api/chronoread/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'user',
          content: userQuery,
          mode: currentMode === SearchMode.BOOK ? 'BOOK' : 'CASE_STUDY',
        }),
      }).catch((error) => console.error('Error saving user message:', error));
    }

    if (selectedTool === 'image' || selectedTool === 'video') {
      setIsLoading(true);

      try {
        const assistantTimestamp = new Date();
        let assistantMsg: ChatMessage;

        if (selectedTool === 'image') {
          const imageConfig = JSON.parse(sessionStorage.getItem('imageConfig') || '{}');
          const imageResponse = await generateToolImage(userQuery, selectedModel, undefined, imageConfig);
          const assistantContent = imageResponse.imageUrl
            ? `Generated image${imageResponse.modelUsed ? ` (${imageResponse.modelUsed})` : ''}`
            : `I could not generate an image right now. ${imageResponse.error || 'Please try again.'}`;

          assistantMsg = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: assistantContent,
            timestamp: assistantTimestamp,
            media: imageResponse.imageUrl
              ? {
                  type: 'image',
                  url: imageResponse.imageUrl,
                  prompt: userQuery,
                  modelUsed: imageResponse.modelUsed,
                }
              : undefined,
            animate: interactionModeRef.current === 'read',
          };
        } else {
          const videoConfig = JSON.parse(sessionStorage.getItem('videoConfig') || '{}');
          const videoResponse = await generateToolVideo(userQuery, selectedModel, videoConfig);

          let resolvedVideoResponse = videoResponse;
          if (!videoResponse.videoUrl && (videoResponse.operationId || videoResponse.videoId) && (videoResponse.status === 'processing' || !videoResponse.error)) {
            // Poll up to 20 times with 5-second intervals = 100 seconds total (needed for Gemini video generation)
            for (let attempt = 0; attempt < 20; attempt++) {
              console.log(`[Video Polling] Attempt ${attempt + 1}/20, waiting 5 seconds before polling...`);
              await new Promise((resolve) => setTimeout(resolve, 5000));
              
              const polled = await pollToolVideoStatus({
                model: selectedModel,
                provider: videoResponse.provider,
                operationId: videoResponse.operationId,
                videoId: videoResponse.videoId,
              });

              console.log(`[Video Polling] Poll attempt ${attempt + 1}/20 result:`, polled);
              
              resolvedVideoResponse = {
                ...resolvedVideoResponse,
                ...polled,
              };

              if (resolvedVideoResponse.videoUrl && resolvedVideoResponse.status === 'completed') {
                console.log('[Video Polling] Video generation completed!');
                break;
              }

              if (resolvedVideoResponse.error) {
                console.error('[Video Polling] Error received:', resolvedVideoResponse.error);
                break;
              }
              
              if (attempt === 19) {
                console.warn('[Video Polling] Max polling attempts reached');
              }
            }
          }

          const assistantContent = resolvedVideoResponse.videoUrl
            ? `Generated video${resolvedVideoResponse.modelUsed ? ` (${resolvedVideoResponse.modelUsed})` : ''}`
            : `Video request submitted${resolvedVideoResponse.status ? ` (${resolvedVideoResponse.status})` : ''}. ${resolvedVideoResponse.error || 'Provider may still be processing.'}`;

          assistantMsg = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: assistantContent,
            timestamp: assistantTimestamp,
            media: resolvedVideoResponse.videoUrl
              ? {
                  type: 'video',
                  url: resolvedVideoResponse.videoUrl,
                  prompt: userQuery,
                  modelUsed: resolvedVideoResponse.modelUsed,
                }
              : undefined,
            animate: interactionModeRef.current === 'read',
          };
        }

        setMessages((prev) => [...prev, assistantMsg]);

        const updatedHistoryItem: HistoryItem = {
          ...pendingHistoryItem,
          response: assistantMsg.content,
          conversation: [
            ...(pendingHistoryItem.conversation || []),
            {
              role: 'assistant',
              content: assistantMsg.content,
              timestamp: assistantTimestamp,
              media: assistantMsg.media,
            },
          ],
        };
        upsertHistoryItem(updatedHistoryItem);

        if (isAuthenticated) {
          fetch('/api/chronoread/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'assistant',
              content: assistantMsg.content,
              mode: currentMode === SearchMode.BOOK ? 'BOOK' : 'CASE_STUDY',
              audioBlob: null,
            }),
          }).catch((error) => console.error('Error saving media assistant message:', error));
        }
      } catch (error) {
        console.error(error);
        const errorMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `I ran into an error while generating the ${selectedTool}. Please try again.`,
          timestamp: new Date(),
          animate: interactionModeRef.current === 'read',
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }

      return;
    }

    if (interactionModeRef.current === 'read' && isGameIntent(userQuery)) {
      const localGame = buildLocalGameResponse(userQuery);
      const assistantContent = localGame.content.trim();
      const assistantTimestamp = new Date();
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: assistantTimestamp,
        animate: true,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      const updatedHistoryItem: HistoryItem = {
        ...pendingHistoryItem,
        response: assistantContent,
        suggestions: localGame.suggestions,
        suggestion: localGame.suggestions[0],
        conversation: [
          ...(pendingHistoryItem.conversation || []),
          { role: 'assistant', content: assistantContent, timestamp: assistantTimestamp },
        ],
      };
      upsertHistoryItem(updatedHistoryItem);
      setReadSuggestions(localGame.suggestions);

      if (isAuthenticated) {
        fetch('/api/chronoread/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            content: assistantContent,
            mode: currentMode === SearchMode.BOOK ? 'BOOK' : 'CASE_STUDY',
            audioBlob: null,
          }),
        }).catch((error) => console.error('Error saving game assistant message:', error));
      }

      return;
    }

    setIsLoading(true);

    try {
      const chatHistory = [...messages.slice(-5), newUserMsg].map(m => ({ role: m.role, content: m.content }));
      
      // Build attachment context for the AI
      let attachmentContext = '';
      if (attachments && attachments.length > 0) {
        attachmentContext = '\n\nAttached files:\n' + attachments.map(f => `- ${f.name}`).join('\n');
        attachmentContext += '\n\nPlease analyze the attached files and provide insights based on their content.';
      }

      const finalQuery = attachmentContext ? userQuery + attachmentContext : userQuery;

      const narrativeResponse = await generateNarrative(
        finalQuery,
        currentMode,
        settings,
        chatHistory,
        "read",
        {
          profile: userProfile || undefined,
          recentQueries: history.slice(0, 8).map((item) => item.query),
          attachments: attachments, // Pass attachments to the service
        }
      );
      const resolvedModel = normalizeModel(narrativeResponse.modelUsed);
      if (resolvedModel) {
        setLatestResponseModel(resolvedModel);
        if (settings.aiModel === AIModel.AUTO) {
          setLastAutoModel(resolvedModel);
        }
      }

      const narrationWithGames = appendGameSuggestionBlock(narrativeResponse.narration, userQuery, 'read');
      const { cleanedText, suggestions } = parseResponseMetadata(narrationWithGames);
      const baseSuggestions = suggestions.slice(0, 3);
      
      const audioBase64 = '';

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: cleanedText,
        timestamp: new Date(),
        audioBlob: undefined,
        modelUsed: resolvedModel || undefined,
        animate: interactionModeRef.current === "read",
        referencesHtml: narrativeResponse.referencesHtml,
      };

      setMessages(prev => [...prev, assistantMsg]);

      const updatedHistoryItem: HistoryItem = {
        ...pendingHistoryItem,
        response: cleanedText,
        suggestions: baseSuggestions,
        suggestion: baseSuggestions[0],
        modelUsed: resolvedModel || pendingHistoryItem.modelUsed,
        referencesHtml: narrativeResponse.referencesHtml,
        conversation: [
          ...(pendingHistoryItem.conversation || []),
          { role: 'assistant', content: cleanedText, timestamp: new Date() },
        ],
      };
      upsertHistoryItem(updatedHistoryItem);

      if (currentMode === SearchMode.BOOK && shouldSwitchFromBookResponse(cleanedText)) {
        setSearchMode(SearchMode.CASE_STUDY);
      }

      // Save assistant message to database if authenticated
      if (isAuthenticated) {
        fetch('/api/chronoread/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            content: cleanedText,
            mode: currentMode === SearchMode.BOOK ? 'BOOK' : 'CASE_STUDY',
            audioBlob: audioBase64 || null,
          }),
        }).catch((error) => console.error('Error saving assistant message:', error));
      }

      setReadSuggestions(baseSuggestions);

      void (async () => {
        const generatedSuggestions = await generateSuggestions(userQuery, settings.language, chatHistory);
        const fallbackSuggestions = buildSuggestionFallback(userQuery);
        const mergedSuggestions = [...baseSuggestions, ...generatedSuggestions, ...fallbackSuggestions]
          .map((item) => item.trim())
          .filter(Boolean)
          .filter((value, index, list) => list.indexOf(value) === index)
          .slice(0, 3);

        if (mergedSuggestions.length > 0) {
          setReadSuggestions(mergedSuggestions);
          upsertHistoryItem({
            ...updatedHistoryItem,
            suggestions: mergedSuggestions,
            suggestion: mergedSuggestions[0],
          });
        }
      })();

    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I encountered an error while processing your narrative request.",
        timestamp: new Date(),
        animate: interactionModeRef.current === "read",
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (query: string, attachments: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    base64?: string;
    tool: string;
  }> = []) => {
    if (!query.trim() || isLoading) return;
    await submitQuery(query, attachments);
  };

  const handleToolSelect = (tool: string) => {
    // Create a new session with tool heading
    setSelectedTool(tool);
    startNewChatSession();
    
    // Add tool context heading
    const toolHeadings: Record<string, string> = {
      image: "🎨 Image Creation Session",
      video: "🎬 Video Creation Session",
      ocr: "📄 OCR Session",
      document: "📝 Document Generation Session",
      dashboard: "📊 Dashboard Session",
    };
    
    const heading = toolHeadings[tool] || `${tool} Session`;
    const toolMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `**${heading}**\n\nReady to assist with ${tool}. What would you like to do?`,
      timestamp: new Date(),
      animate: false,
    };
    setMessages([toolMsg]);
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    // Settings are auto-saved based on the model selection
  };

  const openMediaDialog = (message: ChatMessage) => {
    if (!message.media) return;
    setMediaDialog({
      open: true,
      type: message.media.type,
      url: message.media.url,
      prompt: message.media.prompt,
      modelUsed: message.media.modelUsed,
    });
  };

  const handleMediaDownload = async () => {
    if (!mediaDialog?.url) return;

    try {
      const directAnchor = document.createElement('a');
      directAnchor.href = mediaDialog.url;
      directAnchor.target = '_blank';
      directAnchor.rel = 'noopener noreferrer';
      directAnchor.download = mediaDialog.type === 'image' ? 'generated-image.png' : 'generated-video.mp4';
      document.body.appendChild(directAnchor);
      directAnchor.click();
      document.body.removeChild(directAnchor);
      return;
    } catch {
    }

    try {
      const response = await fetch(mediaDialog.url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`Download request failed with ${response.status}`);
      }
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = mediaDialog.type === 'image' ? 'generated-image.png' : 'generated-video.mp4';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleMediaRegenerate = async () => {
    if (!mediaDialog?.prompt.trim()) return;

    setIsMediaRegenerating(true);
    try {
      if (mediaDialog.type === 'image') {
        const imageConfig = JSON.parse(sessionStorage.getItem('imageConfig') || '{}');
        const regenerated = await generateToolImage(mediaDialog.prompt, selectedModel, mediaDialog.url, imageConfig);
        if (regenerated.imageUrl) {
          const regeneratedUrl = regenerated.imageUrl;
          const assistantMsg: ChatMessage = {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `Generated image${regenerated.modelUsed ? ` (${regenerated.modelUsed})` : ''}`,
            timestamp: new Date(),
            media: {
              type: 'image',
              url: regeneratedUrl,
              prompt: mediaDialog.prompt,
              modelUsed: regenerated.modelUsed,
            },
            animate: interactionModeRef.current === 'read',
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setMediaDialog((prev) => prev ? { ...prev, url: regeneratedUrl, modelUsed: regenerated.modelUsed } : prev);
        }
      } else {
        const videoConfig = JSON.parse(sessionStorage.getItem('videoConfig') || '{}');
        const regenerated = await generateToolVideo(mediaDialog.prompt, selectedModel, videoConfig);
        if (regenerated.videoUrl) {
          const regeneratedUrl = regenerated.videoUrl;
          const assistantMsg: ChatMessage = {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `Generated video${regenerated.modelUsed ? ` (${regenerated.modelUsed})` : ''}`,
            timestamp: new Date(),
            media: {
              type: 'video',
              url: regeneratedUrl,
              prompt: mediaDialog.prompt,
              modelUsed: regenerated.modelUsed,
            },
            animate: interactionModeRef.current === 'read',
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setMediaDialog((prev) => prev ? { ...prev, url: regeneratedUrl, modelUsed: regenerated.modelUsed } : prev);
        }
      }
    } catch (error) {
      console.error('Regenerate failed:', error);
    } finally {
      setIsMediaRegenerating(false);
    }
  };

  const getModelLabel = (model: AIModel) => {
    switch (model) {
      case AIModel.GEMINI:
        return 'Gemini';
      case AIModel.CLAUDE_SONNET:
        return 'Claude Sonnet';
      case AIModel.XAI:
        return 'xAI';
      case AIModel.OPENAI:
        return 'OpenAI';
      default:
        return 'Auto';
    }
  };

  const getCurrentModelLabel = () => {
    if (settings.aiModel === AIModel.AUTO) {
      return getModelLabel(lastAutoModel || latestResponseModel || AIModel.AUTO);
    }
    return getModelLabel(settings.aiModel);
  };

  const normalizeModel = (value?: string): AIModel | null => {
    if (!value) return null;
    const normalized = value.toLowerCase();
    if (normalized === AIModel.OPENAI) return AIModel.OPENAI;
    if (normalized === AIModel.CLAUDE_SONNET) return AIModel.CLAUDE_SONNET;
    if (normalized === AIModel.GEMINI) return AIModel.GEMINI;
    if (normalized === AIModel.XAI) return AIModel.XAI;
    return null;
  };

  async function handleListenTranscript(transcript: string) {
    if (!transcript.trim() || isLoading) return;

    initAudio();
    const inferredLanguage = inferLanguageFromTranscript(transcript);
    const effectiveLanguage = inferredLanguage || settings.language;
    if (inferredLanguage && inferredLanguage !== settings.language) {
      setSettings((prev) => ({
        ...prev,
        language: inferredLanguage,
      }));
      setRecognitionLanguageFor(inferredLanguage);
    }
    const resolvedMode = resolveSearchMode(transcript, searchMode);
    if (resolvedMode !== searchMode) {
      setSearchMode(resolvedMode);
    }
    const currentMode = resolvedMode;
    const wasNarrating = isNarratingRef.current;
    const requestTimestamp = new Date();
    listenRequestPendingRef.current = true;
    lastListenQueryRef.current = transcript;
    if (wasNarrating) {
      stopNarration();
    }

    let historyId = activeListenSessionIdRef.current;
    if (!historyId) {
      historyId = Math.random().toString(36).substr(2, 9);
      activeListenSessionIdRef.current = historyId;
    }

    const existingItem = history.find((entry) => entry.id === historyId);
    const existingConversation: Array<Pick<ChatMessage, 'role' | 'content' | 'timestamp'>> = existingItem?.conversation?.map((entry) => ({
      ...entry,
      role: entry.role as 'user' | 'assistant',
    })) || [];

    const pendingHistoryItem: HistoryItem = {
      id: historyId,
      query: transcript,
      mode: currentMode,
      interactionMode: "listen",
      timestamp: requestTimestamp,
      response: undefined,
      audioBlob: undefined,
      suggestions: existingItem?.suggestions,
      modelUsed: existingItem?.modelUsed,
      voiceProfile: existingItem?.voiceProfile,
      conversation: [...existingConversation, { role: 'user', content: transcript, timestamp: requestTimestamp }],
    };
    upsertHistoryItem(pendingHistoryItem);
    if (selectedHistory?.id === historyId) {
      setSelectedHistory(pendingHistoryItem);
    }
    setSelectedHistoryId(historyId);

    setListenStatus("thinking");
    setIsLoading(true);

    try {
      const continuation = wasNarrating && lastNarrationRef.current
        ? {
            previousNarration: lastNarrationRef.current,
            userInterruption: transcript,
          }
        : undefined;

      const narrativeResponse = await generateNarrative(
        transcript,
        currentMode,
        { ...settings, language: effectiveLanguage },
        existingConversation.slice(-6).map((entry) => ({ role: entry.role, content: entry.content })),
        "listen",
        {
          profile: userProfile || undefined,
          recentQueries: history.slice(0, 8).map((item) => item.query),
        },
        continuation
      );

      const resolvedModel = normalizeModel(narrativeResponse.modelUsed);
      if (resolvedModel) {
        setLatestResponseModel(resolvedModel);
        if (settings.aiModel === AIModel.AUTO) {
          setLastAutoModel(resolvedModel);
        }
      }

      const narrationWithGames = appendGameSuggestionBlock(narrativeResponse.narration, transcript, 'listen');
      const { cleanedText, voiceProfile } = parseResponseMetadata(narrationWithGames);
      const genre = voiceProfile.genre;
      lastNarrationRef.current = cleanedText;

      const excerpt = getTtsExcerpt(cleanedText, "listen");
      const startListenNarration = async () => {
        if (settings.ttsProvider === TextToSpeechProvider.OPEN_SOURCE) {
          try {
            playBrowserTTS(excerpt, { listenMode: true, genre: genre || null, voiceProfile });
          } catch (fallbackError) {
            console.error('Browser TTS failed:', fallbackError);
          }
          return;
        }

        const playStatus = await playTtsInChunks(excerpt, voiceProfile, { listenMode: true, genre: genre || null });
        if (playStatus === 'timeout') {
          setListenStatus(isMicMutedRef.current ? "idle" : "listening");
          return;
        }
        if (playStatus === 'failed') {
          try {
            playBrowserTTS(excerpt, { listenMode: true, genre: genre || null, voiceProfile });
          } catch (fallbackError) {
            console.error('Browser TTS fallback failed:', fallbackError);
            setMessages(prev => [...prev, {
              id: `tts-error-${Date.now()}`,
              role: 'assistant',
              content: 'Audio narration failed. The text response is shown below.',
              timestamp: new Date(),
              mode: currentMode,
              animate: interactionModeRef.current === "read",
            }]);
            setListenStatus(isMicMutedRef.current ? "idle" : "listening");
          }
        }
      };

      void startListenNarration();

      const now = new Date();
      const newConversation = [
        { role: 'user' as const, content: transcript, timestamp: requestTimestamp },
        { role: 'assistant' as const, content: cleanedText, timestamp: new Date() },
      ];
      const mergedConversation: Array<Pick<ChatMessage, 'role' | 'content' | 'timestamp'>> = [
        ...existingConversation,
        ...newConversation,
      ];

      const historyItem: HistoryItem = {
        id: historyId,
        query: transcript,
        mode: currentMode,
        interactionMode: "listen",
        timestamp: now,
        response: cleanedText,
        genre,
        modelUsed: resolvedModel || existingItem?.modelUsed,
        voiceProfile,
        conversation: mergedConversation,
        referencesHtml: narrativeResponse.referencesHtml,
      };

      upsertHistoryItem(historyItem);
      if (selectedHistory?.id === historyId) {
        setSelectedHistory(historyItem);
      }

      if (currentMode === SearchMode.BOOK && shouldSwitchFromBookResponse(cleanedText)) {
        setSearchMode(SearchMode.CASE_STUDY);
      }

      if (isAuthenticated) {
        fetch('/api/chronoread/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'user',
            content: transcript,
            mode: currentMode === SearchMode.BOOK ? 'BOOK' : 'CASE_STUDY',
          }),
        }).catch((error) => console.error('Error saving listen user message:', error));

        fetch('/api/chronoread/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            content: cleanedText,
            mode: currentMode === SearchMode.BOOK ? 'BOOK' : 'CASE_STUDY',
            audioBlob: null,
          }),
        }).catch((error) => console.error('Error saving listen assistant message:', error));
      }
    } catch (error) {
      console.error(error);
      setListenStatus("listening");
    } finally {
      setIsLoading(false);
      listenRequestPendingRef.current = false;
      if (interactionModeRef.current === "listen" && !isNarratingRef.current && !ttsSessionRef.current) {
        setListenStatus("listening");
      }
    }
  }

  const handleReadSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    void submitQuery(suggestion);
  };

  const handleNarrateHistoryEntry = async (
    entry: { role: string; content: string },
    entryKey: string,
    voiceProfile?: VoiceProfile
  ) => {
    if (entry.role !== 'assistant') return;
    if (isNarrating && activeNarrationKeyRef.current === entryKey) {
      handleStopNarration();
      return;
    }
    handleStopNarration();
    activeNarrationKeyRef.current = entryKey;
    setActiveNarrationKey(entryKey);
    setIsHistoryNarrationLoading(true);
    setListenStatus('thinking');
    const excerpt = getTtsExcerpt(entry.content, "listen");
    if (settings.ttsProvider === TextToSpeechProvider.OPEN_SOURCE) {
      try {
        playBrowserTTS(excerpt, {
          onComplete: () => {
            if (activeNarrationKeyRef.current === entryKey) {
              activeNarrationKeyRef.current = null;
              setActiveNarrationKey(null);
            }
            setIsHistoryNarrationLoading(false);
            setListenStatus('idle');
          },
          voiceProfile,
        });
      } catch (fallbackError) {
        console.error('Browser TTS failed:', fallbackError);
        setIsHistoryNarrationLoading(false);
        setListenStatus('idle');
      }
      setIsHistoryNarrationLoading(false);
      setListenStatus('narrating');
      return;
    }

    const playStatus = await playTtsInChunks(excerpt, voiceProfile, {
      listenMode: false,
      onStart: () => {
        setIsHistoryNarrationLoading(false);
        setListenStatus('narrating');
      },
      onFinish: () => {
        setIsHistoryNarrationLoading(false);
        setListenStatus('idle');
      },
    });
    if (playStatus === 'timeout') {
      if (activeNarrationKeyRef.current === entryKey) {
        activeNarrationKeyRef.current = null;
        setActiveNarrationKey(null);
      }
      setIsHistoryNarrationLoading(false);
      setListenStatus('idle');
      return;
    }
    if (playStatus === 'failed') {
      try {
        playBrowserTTS(excerpt, {
          onComplete: () => {
            if (activeNarrationKeyRef.current === entryKey) {
              activeNarrationKeyRef.current = null;
              setActiveNarrationKey(null);
            }
            setIsHistoryNarrationLoading(false);
            setListenStatus('idle');
          },
          voiceProfile,
        });
      } catch (fallbackError) {
        console.error('Browser TTS fallback failed:', fallbackError);
        setIsHistoryNarrationLoading(false);
        setListenStatus('idle');
      }
      return;
    }

    if (activeNarrationKeyRef.current === entryKey) {
      activeNarrationKeyRef.current = null;
      setActiveNarrationKey(null);
    }
    setIsHistoryNarrationLoading(false);
    setListenStatus('idle');
  };

  const handleNarrateReadMessage = async (msg: ChatMessage) => {
    if (msg.role !== 'assistant') return;
    if (isNarrating && activeNarrationKeyRef.current === msg.id) {
      handleStopNarration();
      return;
    }

    handleStopNarration();
    activeNarrationKeyRef.current = msg.id;
    setActiveNarrationKey(msg.id);
    setListenStatus('thinking');

    const excerpt = getTtsExcerpt(msg.content, 'read');

    if (settings.ttsProvider === TextToSpeechProvider.OPEN_SOURCE) {
      try {
        playBrowserTTS(excerpt, {
          onComplete: () => {
            if (activeNarrationKeyRef.current === msg.id) {
              activeNarrationKeyRef.current = null;
              setActiveNarrationKey(null);
            }
            setListenStatus('idle');
          },
        });
      } catch (fallbackError) {
        console.error('Browser TTS failed:', fallbackError);
        setListenStatus('idle');
      }
      return;
    }

    const playStatus = await playTtsInChunks(excerpt, undefined, {
      listenMode: false,
      onStart: () => setListenStatus('narrating'),
      onFinish: () => setListenStatus('idle'),
    });

    if (playStatus === 'timeout') {
      if (activeNarrationKeyRef.current === msg.id) {
        activeNarrationKeyRef.current = null;
        setActiveNarrationKey(null);
      }
      setListenStatus('idle');
      return;
    }

    if (playStatus === 'failed') {
      try {
        playBrowserTTS(excerpt, {
          onComplete: () => {
            if (activeNarrationKeyRef.current === msg.id) {
              activeNarrationKeyRef.current = null;
              setActiveNarrationKey(null);
            }
            setListenStatus('idle');
          },
        });
      } catch (fallbackError) {
        console.error('Browser TTS fallback failed:', fallbackError);
        setListenStatus('idle');
      }
      return;
    }

    if (activeNarrationKeyRef.current === msg.id) {
      activeNarrationKeyRef.current = null;
      setActiveNarrationKey(null);
    }
    setListenStatus('idle');
  };

  const closeListenModal = () => {
    handleStopNarration();
    resetListenSession();
    setSelectedHistory(null);
  };

  const loadReadHistory = (item: HistoryItem) => {
    const conversation = item.conversation?.length
      ? item.conversation
      : [
          { role: 'user' as const, content: item.query, timestamp: item.timestamp },
          ...(item.response
            ? [{ role: 'assistant' as const, content: item.response, timestamp: item.timestamp }]
            : []),
        ];

    const mappedMessages: ChatMessage[] = conversation.map((entry, index) => ({
      id: `${item.id}-${index}`,
      role: entry.role,
      content: entry.content,
      timestamp: entry.timestamp,
      mode: item.mode,
      media: entry.media,
      modelUsed: entry.modelUsed,
      referencesHtml: entry.referencesHtml,
      animate: false,
    }));

    resetMessageUiState();
    setMessages(mappedMessages);
    setInteractionMode("read");
    setSearchMode(item.mode);
    activeReadSessionIdRef.current = item.id;
    if (item.modelUsed) {
      setLatestResponseModel(item.modelUsed);
    }
    setReadSuggestions(item.suggestions || (item.suggestion ? [item.suggestion] : []));
    setInputValue('');
    const lastUser = [...mappedMessages].reverse().find((entry) => entry.role === 'user');
    if (lastUser) {
      activeRequestIdRef.current = lastUser.id;
      setActiveRequestId(lastUser.id);
    } else {
      activeRequestIdRef.current = null;
      setActiveRequestId(null);
    }
  };

  useEffect(() => {
    handleListenTranscriptRef.current = handleListenTranscript;
  }, [handleListenTranscript]);

  const getListenConversation = (item: HistoryItem) => {
    if (item.conversation?.length) return item.conversation;
    const fallback: HistoryConversationEntry[] = [
      { role: 'user', content: item.query, timestamp: item.timestamp },
    ];
    if (item.response) {
      fallback.push({ role: 'assistant', content: item.response, timestamp: item.timestamp });
    }
    return fallback;
  };

  const isListenBusy = listenStatus === "thinking" || isNarrating;

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--muted)] text-sm uppercase tracking-widest">Loading session</div>
      </div>
    );
  }

  // Conditional render for auth check
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-[var(--foreground)] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-[var(--shadow)]">
            <span className="text-2xl font-bold text-[var(--background)]">S</span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-4">Welcome to Self \ Fles</h1>
          <p className="text-[var(--muted)] mb-8 text-lg">Self companion AI app.</p>
          <div className="space-y-3">
            <button
              onClick={() => router.push('/auth/signin')}
              className="w-full py-4 px-6 bg-[var(--foreground)] text-[var(--background)] font-bold rounded-xl transition-all transform hover:scale-105 active:scale-95"
            >
              Sign In
            </button>
            <button
              onClick={() => router.push('/auth/signup')}
              className="w-full py-4 px-6 bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] font-bold rounded-xl hover:bg-[var(--surface-strong)] transition-all"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[var(--background)] text-[var(--foreground)] font-sans overflow-hidden">
      {/* Sidebar - History */}
      <aside className="w-64 border-r border-[var(--border)] hidden md:flex md:flex-col">
        <Link
          href="/"
          onClick={stopNarrationForUiChange}
          className="p-6 border-b border-[var(--border)] flex items-center gap-3 hover:bg-[var(--surface-strong)] transition-colors"
        >
          <div className="w-8 h-8 bg-[var(--foreground)] rounded-md flex items-center justify-center">
            <span className="text-[var(--background)] font-bold text-xl">S</span>
          </div>
          <span className="font-bold tracking-tight text-lg">Self \ Fles</span>
        </Link>
        
        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-4 text-[var(--muted)] text-xs font-semibold uppercase tracking-widest">
            <HistoryIcon className="w-4 h-4" />
            <span>Neural History</span>
          </div>

          {/* NEW: History Tabs (Chat/Voice) */}
          <div className="flex gap-2 mb-4 border-b border-[var(--border)] pb-2">
            <button
              onClick={() => setHistoryTab("all")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                historyTab === "all"
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'text-[var(--muted-strong)] hover:bg-[var(--surface-strong)]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setHistoryTab("chat")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                historyTab === "chat"
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'text-[var(--muted-strong)] hover:bg-[var(--surface-strong)]'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setHistoryTab("voice")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                historyTab === "voice"
                  ? 'bg-[var(--foreground)] text-[var(--background)]'
                  : 'text-[var(--muted-strong)] hover:bg-[var(--surface-strong)]'
              }`}
            >
              Voice
            </button>
          </div>

          <div className="space-y-1 flex-1 overflow-y-auto">
            {filteredHistory.length === 0 ? (
              <p className="text-[var(--muted)] text-sm italic">No recent explorations</p>
            ) : (
              filteredHistory.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      stopNarrationForUiChange();
                      setSelectedHistoryId(item.id);
                      if (item.interactionMode === "listen") {
                        setSelectedHistory(item);
                        activeListenSessionIdRef.current = item.id;
                      } else {
                        setSelectedHistory(null);
                        loadReadHistory(item);
                      }
                    }}
                    className={`flex-1 text-left p-3 rounded-lg transition-colors text-sm truncate ${
                      selectedHistoryId === item.id
                        ? 'bg-[var(--surface-strong)] text-[var(--foreground)]'
                        : 'text-[var(--muted-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] active:bg-[var(--surface-strong)]'
                    }`}
                    aria-current={selectedHistoryId === item.id}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate">{item.query}</span>
                      <span className="ml-auto text-[9px] uppercase tracking-widest text-[var(--muted)]">
                        {item.interactionMode === "listen" ? "Listen" : "Read"}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteHistoryItem(item.id);
                    }}
                    className="p-1.5 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)]"
                    aria-label={`Delete ${item.query}`}
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6l-12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[var(--border)] flex flex-col gap-2">
          <div className="px-3 py-1 flex items-center gap-2 text-[10px] text-[var(--muted)] uppercase tracking-widest">
            <span>{settings.language} Mode</span>
          </div>
          <div
            onClick={stopNarrationForUiChange}
            className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-strong)] text-[var(--muted-strong)]"
          >
            <ThemeToggle className="h-8 w-8 shadow-none" />
            <span className="text-sm font-semibold">Theme</span>
          </div>
          <Link
            href="/settings"
            onClick={stopNarrationForUiChange}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--surface-strong)] transition-colors text-[var(--muted-strong)]"
          >
            <SettingsIcon />
            <span>Settings</span>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--surface-strong)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative bg-[var(--background)]">
        {/* Header (Mobile) */}
        <header className="md:hidden p-4 border-b border-[var(--border)] flex justify-between items-center">
          <span className="font-bold">Self \ Fles</span>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition-colors hover:bg-[var(--surface-strong)]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-[var(--background)]">
            <div className="absolute inset-0 w-full bg-[var(--background)] shadow-xl flex flex-col">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <span className="font-bold">Menu</span>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition-colors hover:bg-[var(--surface-strong)]"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-4 text-[var(--muted)] text-xs font-semibold uppercase tracking-widest">
                  <HistoryIcon className="w-4 h-4" />
                  <span>Neural History</span>
                </div>

                {/* Mobile History Tabs */}
                <div className="flex gap-2 mb-4 border-b border-[var(--border)] pb-2 overflow-x-auto">
                  <button
                    onClick={() => setHistoryTab("all")}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-all whitespace-nowrap ${
                      historyTab === "all"
                        ? 'bg-[var(--foreground)] text-[var(--background)]'
                        : 'text-[var(--muted-strong)] hover:bg-[var(--surface-strong)]'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setHistoryTab("chat")}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-all whitespace-nowrap ${
                      historyTab === "chat"
                        ? 'bg-[var(--foreground)] text-[var(--background)]'
                        : 'text-[var(--muted-strong)] hover:bg-[var(--surface-strong)]'
                    }`}
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setHistoryTab("voice")}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-all whitespace-nowrap ${
                      historyTab === "voice"
                        ? 'bg-[var(--foreground)] text-[var(--background)]'
                        : 'text-[var(--muted-strong)] hover:bg-[var(--surface-strong)]'
                    }`}
                  >
                    Voice
                  </button>
                </div>

                <div className="space-y-1 flex-1 overflow-y-auto">
                  {filteredHistory.length === 0 ? (
                    <p className="text-[var(--muted)] text-sm italic">No recent explorations</p>
                  ) : (
                    filteredHistory.map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            stopNarrationForUiChange();
                            setSelectedHistoryId(item.id);
                            if (item.interactionMode === "listen") {
                              setSelectedHistory(item);
                              activeListenSessionIdRef.current = item.id;
                            } else {
                              setSelectedHistory(null);
                              loadReadHistory(item);
                            }
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex-1 text-left p-3 rounded-lg transition-colors text-sm truncate ${
                            selectedHistoryId === item.id
                              ? 'bg-[var(--surface-strong)] text-[var(--foreground)]'
                              : 'text-[var(--muted-strong)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] active:bg-[var(--surface-strong)]'
                          }`}
                          aria-current={selectedHistoryId === item.id}
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate">{item.query}</span>
                            <span className="ml-auto text-[9px] uppercase tracking-widest text-[var(--muted)]">
                              {item.interactionMode === "listen" ? "Listen" : "Read"}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteHistoryItem(item.id);
                          }}
                          className="p-1.5 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)]"
                          aria-label={`Delete ${item.query}`}
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6l-12 12" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-[var(--border)] flex flex-col gap-2">
                <div className="px-3 py-1 flex items-center gap-2 text-[10px] text-[var(--muted)] uppercase tracking-widest">
                  <span>{settings.language} Mode</span>
                </div>
                <div
                  onClick={stopNarrationForUiChange}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-strong)] text-[var(--muted-strong)]"
                >
                  <ThemeToggle className="h-8 w-8 shadow-none" />
                  <span className="text-sm font-semibold">Theme</span>
                </div>
                <Link
                  href="/settings"
                  onClick={() => {
                    stopNarrationForUiChange();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--surface-strong)] transition-colors text-[var(--muted-strong)]"
                >
                  <SettingsIcon />
                  <span>Settings</span>
                </Link>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    signOut({ callbackUrl: '/auth/signin' });
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--surface-strong)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {interactionMode === "read" ? (
          <div className="flex-1 overflow-y-auto overflow-x-hidden pl-3 pr-3 sm:pl-4 sm:pr-4 md:px-0 scroll-smooth pb-28 md:pb-10" ref={readScrollContainerRef}>
            <div className="max-w-3xl mx-auto py-8 md:py-10 space-y-6 px-0">
              {messages.length === 0 && (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-16 h-16 bg-[var(--surface)] rounded-2xl flex items-center justify-center border border-[var(--border)]">
                    <span className="text-3xl font-bold">S</span>
                  </div>
                  <div>
                    <div className="brand-flip text-4xl md:text-5xl font-bold tracking-tight">
                      <span className="brand-flip-word">Self</span>
                      <span className="brand-flip-slash">{"\\"}</span>
                      <span className="brand-flip-word brand-flip-delay">Fles</span>
                    </div>
                    <p className="text-[var(--muted)] max-w-sm mx-auto mt-3 text-sm md:text-base">
                      Flip into calm, grounded narration that listens back.
                    </p>
                  </div>
                </div>
              )}

              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isLatestMessage = index === messages.length - 1;
                const displayContent = isUser ? msg.content : getAssistantDisplayContent(msg);
                return (
                  <div
                    key={msg.id}
                    ref={isUser ? (node) => registerUserMessageNode(msg.id, node) : undefined}
                    data-message-id={isUser ? msg.id : undefined}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[92%] md:max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
                      <div className={`p-2.5 sm:p-3.5 md:p-4 rounded-2xl text-xs sm:text-sm md:text-[15px] leading-relaxed ${
                        isUser
                          ? 'bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)]'
                          : 'bg-transparent text-[var(--foreground)]'
                      }`}>
                        {msg.role === 'assistant' && interactionMode === 'read' && settings.narrationType === 'Realistic' && isLatestMessage && isLoading && !hasGameBlock(displayContent) && (
                          <div className="mb-3">
                            <NanobotCanvas isActive={true} />
                          </div>
                        )}
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none dark:prose-invert overflow-x-auto -mx-2 px-2">
                            {msg.media && (
                              <button
                                type="button"
                                onClick={() => openMediaDialog(msg)}
                                className="mb-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-left"
                              >
                                {msg.media.type === 'image' ? (
                                  <img
                                    src={msg.media.url}
                                    alt="Generated"
                                    className="w-full max-h-80 object-contain rounded-lg"
                                  />
                                ) : (
                                  <video
                                    src={msg.media.url}
                                    className="w-full max-h-80 rounded-lg"
                                    preload="metadata"
                                    muted
                                  />
                                )}
                                <p className="mt-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">
                                  Click to edit, regenerate, download
                                </p>
                              </button>
                            )}
                            {sanitizeNarrationForDisplay(displayContent).trim() && (
                              <RichMarkdown content={sanitizeNarrationForDisplay(displayContent)} />
                            )}
                          </div>
                        ) : (
                          displayContent
                        )}
                    </div>
                    {msg.role === 'assistant' && (
                      <>
                        <div className="text-[10px] text-[var(--muted)] px-2 flex items-center gap-3 uppercase tracking-tighter mt-2">
                          <button
                            onClick={() => {
                              if (msg.audioBlob) {
                                handlePlayAudio(msg.audioBlob);
                              } else {
                                void handleNarrateReadMessage(msg);
                              }
                            }}
                            className="p-0.5 hover:text-[var(--foreground)] transition-colors"
                            title="Listen to narration"
                          >
                            <VolumeIcon className="w-3.5 h-3.5" />
                          </button>
                          <span>Self \\ Fles</span>
                          <span>•</span>
                          <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {msg.modelUsed && (
                            <>
                              <span>•</span>
                              <span>{getModelLabel(msg.modelUsed)}</span>
                            </>
                          )}
                        </div>
                        {msg.referencesHtml && (
                          <div className="mt-3 px-2">
                            <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">References</p>
                            <div dangerouslySetInnerHTML={{ __html: msg.referencesHtml }} />
                          </div>
                        )}
                      </>
                    )}
                    {isUser && (
                      <div className="text-[10px] text-[var(--muted)] px-2 flex items-center gap-2 uppercase tracking-tighter">
                        You 
                        <span>•</span>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
              {isLoading && (
                <div className="flex justify-start">
                  {selectedTool === 'image' || selectedTool === 'video' ? (
                    <div className="media-loader-square">
                      <div className="media-loader-grid" />
                      <div className="media-loader-scan" />
                    </div>
                  ) : (
                    <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-2xl animate-pulse">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce delay-75"></div>
                        <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce delay-150"></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!isLoading && readSuggestions.length > 0 && userMessages.length < 10 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">Suggested next</p>
                  <div className="flex flex-wrap gap-2">
                    {readSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleReadSuggestionClick(suggestion)}
                        className="px-3 py-1.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted-strong)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)] transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 px-4 md:px-0">
            <div className="listen-stage max-w-5xl mx-auto h-full flex items-center justify-center">
              <div className="listen-orbital" style={{ ['--pulse' as string]: pulse.toString() }}>
                <div className="listen-orb" />
                <div className="listen-core" />
                {listenStatus !== "narrating" && Array.from({ length: 12 }).map((_, index) => (
                  <span
                    key={index}
                    className={`listen-particle listen-particle-${index + 1} ${listenStatus === "thinking" ? "listen-particle-fast" : ""}`}
                  />
                ))}
                <div className="listen-status">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    {listenStatus === "thinking" ? 'Thinking' : listenStatus === "narrating" ? 'Narrating' : listenStatus === "completed" ? 'Completed' : isMicMuted ? 'Muted' : 'Listening'}
                  </p>
                  {/* Book/Case Study mode label commented out for now. */}
                  <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
                    AI Model: {getCurrentModelLabel()}
                  </p>
                </div>
              </div>
              <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={stopAndReturnToRead}
                    className="p-3 rounded-xl transition-all bg-[var(--foreground)] text-[var(--background)]"
                    title="Stop and return to read"
                  >
                    <StopIcon className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`p-3 rounded-xl transition-all ${isMicMuted ? 'bg-[var(--surface)] text-[var(--muted)]' : 'bg-[var(--foreground)] text-[var(--background)]'}`}
                    title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
                  >
                    <MicIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {interactionMode === "read" && userMessages.length > 0 && (
          <>
            {/* Numbered buttons - Desktop view */}
            <div className="hidden md:flex flex-col justify-start gap-1 fixed right-2 sm:right-4 md:right-6 top-24 sm:top-28 md:top-8 z-20 max-h-[calc(100vh-300px)] md:max-h-[calc(100vh-250px)] overflow-y-auto pr-1 py-2">
              {userMessages.slice(0, 10).map((msg, index) => {
                const isActive = activeRequestId === msg.id;
                return (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => scrollToMessage(msg.id)}
                    className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full border text-[10px] sm:text-xs font-bold tracking-tight transition-all flex-shrink-0 ${
                      isActive
                        ? 'bg-[var(--foreground)] text-[var(--background)] shadow-lg shadow-[var(--foreground)]/30 border-transparent'
                        : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]'
                    }`}
                    aria-label={`Jump to request ${index + 1}`}
                    title={`Message ${index + 1}`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </button>
                );
              })}
            </div>

            {/* Mobile badge button - small centered badge */}
            <button
              type="button"
              onClick={() => setIsMobileJumpOpen((prev) => !prev)}
              className="md:hidden fixed right-0 top-1/2 -translate-y-1/2 z-30 h-12 w-8 rounded-l-full border-l border-t border-b border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-lg flex items-center justify-center text-xs font-bold"
              aria-label={isMobileJumpOpen ? 'Close jump navigation' : 'Open jump navigation'}
              title="Jump to request"
            >
              <span className="rotate-90">{userMessages.length}</span>
            </button>

            {/* Mobile slider panel */}
            {isMobileJumpOpen && (
              <>
                {/* Backdrop */}
                <div 
                  className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                  onClick={() => setIsMobileJumpOpen(false)}
                  aria-hidden="true"
                />
                
                {/* Slider panel */}
                <div className="md:hidden fixed right-0 top-0 bottom-0 z-50 w-20 bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl animate-in slide-in-from-right duration-200">
                  <div className="h-full flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
                      <span className="text-xs font-semibold text-[var(--muted)]">Jump</span>
                      <button
                        type="button"
                        onClick={() => setIsMobileJumpOpen(false)}
                        className="h-6 w-6 rounded-full bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center text-sm font-bold"
                        aria-label="Close"
                      >
                        ×
                      </button>
                    </div>
                    
                    {/* Numbered buttons with padding */}
                    <div className="flex-1 overflow-y-auto py-4 px-2">
                      <div className="flex flex-col gap-3">
                        {userMessages.slice(0, 10).map((msg, index) => {
                          const isActive = activeRequestId === msg.id;
                          return (
                            <button
                              key={msg.id}
                              type="button"
                              onClick={() => {
                                scrollToMessage(msg.id);
                                setIsMobileJumpOpen(false);
                              }}
                              className={`h-10 w-full rounded-lg border text-sm font-bold transition-all ${
                                isActive
                                  ? 'bg-[var(--foreground)] text-[var(--background)] border-transparent shadow-lg'
                                  : 'border-[var(--border)] bg-[var(--background)] text-[var(--muted)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]'
                              }`}
                              aria-label={`Jump to request ${index + 1}`}
                              title={`Message ${index + 1}`}
                            >
                              {String(index + 1).padStart(2, '0')}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            
            {/* Limit reached overlay popup - appears at sticky footer bottom */}
            {userMessages.length >= 10 && (
              <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
                <div className="pointer-events-auto w-full max-w-2xl bg-[var(--surface-strong)] border-t border-l border-r border-[var(--border)] rounded-t-2xl shadow-2xl p-4 md:p-6">
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-base md:text-lg font-bold text-[var(--foreground)]">
                        🔒 Request Limit Reached
                      </h3>
                      <p className="text-xs md:text-sm text-[var(--muted)] mt-1">
                        You&apos;ve reached 10 conversation turns. Start a new chat to continue.
                      </p>
                    </div>
                    
                    <button
                      type="button"
                      onClick={startNewChatSession}
                      className="w-full py-2 px-3 md:py-2.5 md:px-4 rounded-lg bg-[var(--foreground)] text-[var(--background)] font-semibold text-sm md:text-base hover:opacity-90 transition-all"
                    >
                      ✨ Start New Chat
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {interactionMode === "read" && (
          <div className={`sticky bottom-0 border-t border-[var(--border)] bg-[var(--background)]/90 backdrop-blur p-2 md:p-8 transition-all ${userMessages.length >= 10 ? 'pb-64 md:pb-44' : ''}`}>
            <div className="max-w-3xl mx-auto w-full">
              <div className="relative md:relative w-full z-10 bg-[var(--background)] md:p-0">
                {/* New Chat Button + SearchBar */}
                <div className="flex gap-2 items-start w-full">
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={startNewChatSession}
                      className="mt-2.5 p-2 rounded-xl bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] transition-all flex-shrink-0"
                      title="New topic"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  )}
                  <div className="flex-1">
                    <SearchBar 
                      disabled={userMessages.length >= 10}
                      placeholder={userMessages.length >= 10 ? "Limit reached - start new chat" : "Ask a story, case, or question..."}
                      selectedTool={selectedTool}
                      selectedModel={selectedModel}
                      currentMode={selectedTool || 'text'}
                      isNewChat={messages.length === 0}
                      isListening={isListening}
                      onSearch={(query: string, attachments: AttachedFile[] = []) => {
                        void handleSubmit(query, attachments);
                      }}
                      onToolSelect={handleToolSelect}
                      onModelChange={handleModelChange}
                      onMicClick={toggleMic}
                      onConfigChange={(config: { imageConfig?: Record<string, string>; videoConfig?: Record<string, number | string> }) => {
                        if (config.imageConfig) {
                          // Store image config for use in image generation
                          sessionStorage.setItem('imageConfig', JSON.stringify(config.imageConfig));
                        }
                        if (config.videoConfig) {
                          // Store video config for use in video generation
                          sessionStorage.setItem('videoConfig', JSON.stringify(config.videoConfig));
                        }
                      }}
                    />
                  </div>
                </div>
                {/* Disabled state overlay */}
                {userMessages.length >= 10 && (
                  <div className="absolute inset-0 bg-[var(--background)]/30 rounded-2xl pointer-events-none" />
                )}
              </div>
              <p className="text-[10px] text-center text-[var(--muted)] mt-3 uppercase tracking-widest">
                Processing in {settings.language} Language
              </p>
              <p className="text-[10px] text-center text-[var(--muted)] mt-1 uppercase tracking-widest">
                AI Model: {getCurrentModelLabel()}
              </p>
            </div>
          </div>
        )}
      </main>

      {selectedHistory && selectedHistory.interactionMode === "listen" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[var(--surface)] border border-[var(--border)] w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
            <div className="p-4 sm:p-6 border-b border-[var(--border)] flex justify-between items-center flex-wrap gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold">Listen Session</h2>
                <p className="text-xs text-[var(--muted)] uppercase tracking-widest mt-1 line-clamp-1">{selectedHistory.query}</p>
                <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest mt-2">
                  AI Model: {selectedHistory.modelUsed ? getModelLabel(selectedHistory.modelUsed) : getCurrentModelLabel()}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleStopNarration}
                  disabled={!isListenBusy && !isHistoryNarrationLoading}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {listenStatus === "thinking" || isHistoryNarrationLoading ? (
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--muted)] border-t-transparent" />
                    </span>
                  ) : (
                    <StopIcon className="w-3.5 h-3.5" />
                  )}
                  {listenStatus === "thinking" || isHistoryNarrationLoading ? "Loading" : "Stop"}
                </button>
                <button onClick={closeListenModal} className="text-[var(--muted)] hover:text-[var(--foreground)]">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 max-h-[calc(95vh-200px)] overflow-y-auto overflow-x-hidden">
              <div className="space-y-3">
                {getListenConversation(selectedHistory).map((entry, index) => {
                  const entryKey = `${selectedHistory.id}-${index}`;
                  const isEntryNarrating = isNarrating && activeNarrationKey === entryKey;
                  return (
                  <div key={`${entry.role}-${index}`} className={`p-3 rounded-xl border text-sm ${entry.role === 'user' ? 'border-[var(--border)] bg-[var(--surface-strong)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                    <p className="text-[11px] uppercase tracking-widest text-[var(--muted)] mb-2">{entry.role === 'user' ? 'You' : 'Narrator'}</p>
                    <div className="text-[var(--foreground)] break-words">
                      {entry.role === 'assistant' ? (
                        <>
                          <span className="whitespace-pre-line text-xs sm:text-sm">{sanitizeNarrationForDisplay(entry.content)}</span>
                          {selectedHistory.referencesHtml && index === getListenConversation(selectedHistory).filter(e => e.role === 'assistant').length - 1 && (
                            <div className="mt-3">
                              <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">References</p>
                              <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: selectedHistory.referencesHtml }} />
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="whitespace-pre-line text-xs sm:text-sm">{entry.content}</span>
                      )}
                      {entry.role === 'assistant' && (
                        <button
                          onClick={() => handleNarrateHistoryEntry(entry, entryKey, selectedHistory.voiceProfile)}
                          className={`mt-2 inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-md transition-opacity ${isEntryNarrating ? 'bg-[var(--surface-strong)] text-[var(--foreground)]' : 'bg-[var(--foreground)] text-[var(--background)] hover:opacity-90'}`}
                        >
                          {isEntryNarrating ? <StopIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5" />}
                          {isEntryNarrating ? 'Stop' : 'Play'}
                        </button>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {mediaDialog && (
        <MediaEditorDialog
          open={mediaDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setMediaDialog(null);
              return;
            }
            setMediaDialog((prev) => (prev ? { ...prev, open } : prev));
          }}
          mediaType={mediaDialog.type}
          mediaUrl={mediaDialog.url}
          prompt={mediaDialog.prompt}
          onPromptChange={(value) => setMediaDialog((prev) => (prev ? { ...prev, prompt: value } : prev))}
          onRegenerate={() => {
            void handleMediaRegenerate();
          }}
          onDownload={() => {
            void handleMediaDownload();
          }}
          isBusy={isMediaRegenerating}
        />
      )}

    </div>
  );
}
