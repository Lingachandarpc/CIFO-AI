"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { SearchMode, Settings, ChatMessage, HistoryItem, HistoryConversationEntry, Language, TextToSpeechProvider, Genre, VoiceGender, AIModel, VoiceProfile, DEFAULT_GOOGLE_VOICE } from './types';
import { SettingsIcon, HistoryIcon, MicIcon, StopIcon } from '../components/Icons';
import ThemeToggle from '../components/ThemeToggle';
import SearchBar, { type AttachedFile } from '../components/SearchBar';
import { generateNarrative, generateSpeechDetailed, decodeAudio, getAudioBuffer, generateSuggestions, generateDashboardSuggestions, generateToolImage, generateToolVideo, pollToolVideoStatus, generateToolDocument, generateToolDashboard, generateToolOCR, type TtsAudioPayload } from './services/openaiService';
import MediaEditorDialog from '../components/MediaEditorDialog';
import DashboardDialog from '../components/DashboardDialog';
import { generateSpeechWithElevenLabs } from './services/elevenLabsService';
import { filterVoicesByGender, generateSpeechWithGoogle, getGoogleLanguageCode, listGoogleVoices, resolveGoogleVoice, GoogleVoice } from './services/googleTtsService';
import { generateSpeechWithGemini } from './services/geminiTtsService';
import { createAmbientMusicForGenre, stopAmbientMusic as stopMusicService } from './services/backgroundMusicService';
import NanobotCanvas from '../components/NanobotCanvas';
import ThemeSphere from '../components/ThemeSphere';
import { type GameConfig } from '../components/NanobotGame';
import RichMarkdown from '../components/home/RichMarkdown';

type MediaDialogState = {
  open: boolean;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  modelUsed?: string;
};

type DashboardDialogState = {
  open: boolean;
  url: string;
  title?: string;
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

export default function HomeView() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('auto');
  const [disabledModelIds, setDisabledModelIds] = useState<string[]>([]);
  const [disabledToolIds, setDisabledToolIds] = useState<string[]>([]);
  const [enabledModelsByTool, setEnabledModelsByTool] = useState<Record<string, string[]>>({});
  const [isServiceLocked, setIsServiceLocked] = useState(false);
  const [sessionResponsePolicy, setSessionResponsePolicy] = useState<{
    limit: number | null;
    used: number;
    remaining: number | null;
  } | null>(null);
  const [mediaDialog, setMediaDialog] = useState<MediaDialogState | null>(null);
  const [dashboardDialog, setDashboardDialog] = useState<DashboardDialogState | null>(null);
  const [isMediaRegenerating, setIsMediaRegenerating] = useState(false);
  const mediaRegenAbortRef = useRef<AbortController | null>(null);
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
  const [dashboardLlmSuggestions, setDashboardLlmSuggestions] = useState<string[]>([]);
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
    ttsProvider: TextToSpeechProvider.GEMINI,
    aiModel: AIModel.AUTO,
    enableBackgroundMusic: false,
    backgroundMusicVolume: 0.15,
    enableWebSearch: true,
  });

  const resolveNarrationType = (value?: string): Settings['narrationType'] => {
    if (value === 'Practical') return 'Practical';
    if (value === 'Educational') return 'Educational';
    if (value === 'Personalized') return 'Personalized';
    if (value === 'Dramatic') return 'Practical';
    return 'Realistic';
  };
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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const readScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const userMessageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const assistantContentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScrollUserIdRef = useRef<string | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const typewriterFrameRef = useRef<number | null>(null);
  const activeTypewriterMessageRef = useRef<string | null>(null);
  const copyFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

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
  const lastNarrationRef = useRef<string>('');
  const lastListenQueryRef = useRef<string>('');
  const activeListenSessionIdRef = useRef<string | null>(null);
  const activeReadSessionIdRef = useRef<string | null>(null);
  const activeLanguageRef = useRef<Language>(Language.ENGLISH);
  const activeNarrationTypeRef = useRef<Settings['narrationType']>('Realistic');
  const lastMicInterruptAtRef = useRef<number>(0);
  const lastListenTranscriptRef = useRef<string>('');
  const lastListenTranscriptAtRef = useRef<number>(0);
  const listenRealisticFollowUpRef = useRef<{
    baseQuery: string;
    clarifyingQuestion: string;
  } | null>(null);
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

  const getHistoryBadgeLabel = (item: HistoryItem) => {
    if (item.interactionMode === 'listen') return 'Listen';
    if (item.toolTag === 'OCR') return 'OCR';
    return 'Read';
  };

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
        const lastIdx = event.results.length - 1;
        const transcript = event.results?.[lastIdx]?.[0]?.transcript || '';
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
          setIsServiceLocked(Boolean(authData?.policy?.locked));
          setDisabledToolIds(Array.isArray(authData?.policy?.disabledTools) ? authData.policy.disabledTools : []);
          setDisabledModelIds(Array.isArray(authData?.policy?.disabledModels) ? authData.policy.disabledModels : []);
          setEnabledModelsByTool(
            authData?.policy?.enabledModelsByTool && typeof authData.policy.enabledModelsByTool === 'object'
              ? Object.fromEntries(
                  Object.entries(authData.policy.enabledModelsByTool as Record<string, unknown>)
                    .map(([key, value]) => [
                      String(key || '').trim().toLowerCase(),
                      Array.isArray(value)
                        ? value
                            .map((item) => String(item || '').trim().toLowerCase())
                            .filter(Boolean)
                        : [],
                    ])
                )
              : {}
          );
          setSessionResponsePolicy(authData?.policy
            ? {
                limit: typeof authData.policy.sessionResponseLimit === 'number' ? authData.policy.sessionResponseLimit : null,
                used: Number(authData.policy.sessionResponsesUsed || 0),
                remaining: typeof authData.policy.sessionResponsesRemaining === 'number' ? authData.policy.sessionResponsesRemaining : null,
              }
            : null);
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
            // Migrate legacy defaults to Gemini
            const needsMigration = storedProvider === TextToSpeechProvider.OPENAI || storedProvider === TextToSpeechProvider.GOOGLE;
            const resolvedProvider = needsMigration
              ? TextToSpeechProvider.GEMINI
              : Object.values(TextToSpeechProvider).includes(storedProvider as TextToSpeechProvider)
                ? (storedProvider as TextToSpeechProvider)
                : TextToSpeechProvider.GEMINI;
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
              narrationType: resolveNarrationType(settingsData.settings.narrationType),
              voiceType: settingsData.settings.voiceType || DEFAULT_GOOGLE_VOICE,
              voiceGender: settingsData.settings.voiceGender || VoiceGender.AUTO,
              language: settingsData.settings.language || Language.ENGLISH,
              ttsProvider: resolvedProvider,
              enableBackgroundMusic: settingsData.settings.enableBackgroundMusic !== undefined ? settingsData.settings.enableBackgroundMusic : false,
              backgroundMusicVolume: settingsData.settings.backgroundMusicVolume || 0.15,
            }));

            if (needsMigration) {
              fetch('/api/chronoread/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ttsProvider: TextToSpeechProvider.GEMINI }),
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
          setIsServiceLocked(false);
          setDisabledToolIds([]);
          setEnabledModelsByTool({});
          setSessionResponsePolicy(null);
          loadLocalHistory(null);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setAuthCheckAuthenticated(false);
        setIsServiceLocked(false);
        setDisabledToolIds([]);
        setEnabledModelsByTool({});
        setSessionResponsePolicy(null);
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
    setRecognitionLanguageFor(activeLanguageRef.current || Language.ENGLISH);
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

  const extractRequestedLanguagePreference = (text: string): Language | null => {
    if (!text) return null;

    const normalized = text.toLowerCase().trim();
    const normalizedAscii = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasLanguageIntent =
      /\b(speak|talk|communicate|chat|reply|respond|answer|write|use)\b/.test(normalizedAscii)
      || /\b(language|lang|mode)\b/.test(normalizedAscii)
      || /\b(change|switch|set|keep|continue)\b/.test(normalizedAscii);

    if (!hasLanguageIntent) {
      return null;
    }

    const aliases: Array<{ language: Language; names: string[] }> = [
      { language: Language.ENGLISH, names: ['english', 'inglish'] },
      { language: Language.SPANISH, names: ['spanish', 'espanol', 'español'] },
      { language: Language.FRENCH, names: ['french', 'francais', 'français'] },
      { language: Language.GERMAN, names: ['german', 'deutsch'] },
      { language: Language.CHINESE, names: ['chinese', 'mandarin', 'zhongwen', '中文'] },
      { language: Language.JAPANESE, names: ['japanese', 'nihongo', '日本語'] },
      { language: Language.HINDI, names: ['hindi'] },
      { language: Language.PORTUGUESE, names: ['portuguese', 'portugues', 'português'] },
      { language: Language.TAMIL, names: ['tamil', 'தமிழ்'] },
      { language: Language.TELUGU, names: ['telugu', 'తెలుగు'] },
      { language: Language.MALAYALAM, names: ['malayalam', 'മലയാളം'] },
      { language: Language.KANNADA, names: ['kannada', 'ಕನ್ನಡ'] },
      { language: Language.BENGALI, names: ['bengali', 'bangla', 'বাংলা'] },
      { language: Language.MARATHI, names: ['marathi', 'मराठी'] },
      { language: Language.GUJARATI, names: ['gujarati', 'ગુજરાતી'] },
      { language: Language.PUNJABI, names: ['punjabi', 'panjabi', 'ਪੰਜਾਬੀ'] },
    ];

    const intentTemplates = [
      'speak in {lang}',
      'talk in {lang}',
      'communicate in {lang}',
      'chat in {lang}',
      'reply in {lang}',
      'respond in {lang}',
      'answer in {lang}',
      'write in {lang}',
      'use {lang}',
      'in {lang}',
      '{lang} language',
      'language {lang}',
      'language to {lang}',
      'switch to {lang}',
      'change to {lang}',
      'set language to {lang}',
      'set to {lang}',
      'keep it in {lang}',
      'continue in {lang}',
    ];

    for (const candidate of aliases) {
      for (const alias of candidate.names) {
        const escapedAlias = escapeRegExp(alias);
        const matchesIntent = intentTemplates.some((template) => {
          const pattern = template.replace('{lang}', escapedAlias).replace(/\s+/g, '\\s+');
          return new RegExp(`\\b${pattern}\\b`, 'i').test(normalizedAscii) || new RegExp(`\\b${pattern}\\b`, 'i').test(normalized);
        });

        if (matchesIntent) {
          return candidate.language;
        }
      }
    }

    return null;
  };

  const inferLanguageFromTranscript = (text: string): Language | null => {
    if (!text) return null;
    const explicitlyRequestedLanguage = extractRequestedLanguagePreference(text);
    if (explicitlyRequestedLanguage) return explicitlyRequestedLanguage;

    const normalized = text.toLowerCase().trim();
    const normalizedAscii = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (/[\u0B80-\u0BFF]/.test(text)) return Language.TAMIL;
    if (/[\u0C00-\u0C7F]/.test(text)) return Language.TELUGU;
    if (/[\u0900-\u097F]/.test(text)) return Language.HINDI;
    if (/[\u0980-\u09FF]/.test(text)) return Language.BENGALI;
    if (/[\u0D00-\u0D7F]/.test(text)) return Language.MALAYALAM;
    if (/[\u0C80-\u0CFF]/.test(text)) return Language.KANNADA;
    if (/[\u4E00-\u9FFF]/.test(text)) return Language.CHINESE;
    if (/[\u3040-\u30FF]/.test(text)) return Language.JAPANESE;

    const tamilRomanPatterns = [
      /\bun\s+per\s+enna\b/i,
      /\bunga\s+per\s+enna\b/i,
      /\bun\s+peru\s+enna\b/i,
      /\benna\s+peru\b/i,
      /\benna\b/i,
      /\byaar\b/i,
      /\bthalaivar\b/i,
      /\bavar\b|\bavaru\b|\bavaru\b|\bavanga\b|\bavarukku\b/i,
      /\benna\s+aachi\b|\benna\s+achu\b|\benna\s+aachu\b/i,
      /\bvanakkam\b/i,
      /\bnandri\b/i,
      /\banna\b|\bakka\b|\bthambi\b/i,
      /\bepdi\b|\beppadi\b/i,
      /\birukku\b|\biruka\b|\birukka\b|\birukkaa\b/i,
      /\benga\b|\benge\b|\binge\b|\binga\b/i,
      /\bsollu\b|\bsolunga\b|\bsolra\b/i,
      /\btheriyuma\b|\btheriyala\b/i,
      /\bpakkalam\b|\bpaakalam\b|\bparpom\b/i,
      /\btamil\s*(la|il|mozhi|language)\b/i,
      /\b(in|reply in|answer in|speak in)\s+tamil\b/i,
      /\bsaptiya\b|\bsaaptiya\b/i,
      /\bromba\b/i,
      /\btamil\b/i,
    ];
    if (tamilRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.TAMIL;
    }

    const hindiRomanPatterns = [
      /\bnamaste\b/i,
      /\bkaise\s+ho\b/i,
      /\baap\s+ka\s+naam\s+kya\b/i,
      /\bkya\s+haal\s+hai\b/i,
      /\bdhanyavaad\b|\bshukriya\b/i,
      /\b(in|reply in|answer in|speak in)\s+hindi\b/i,
      /\bhindi\s*(me|mein|language)\b/i,
    ];
    if (hindiRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.HINDI;
    }

    const teluguRomanPatterns = [
      /\bmee\s+peru\s+enti\b|\bmeeku\s+peru\s+enti\b/i,
      /\bela\s+unnav\b|\bela\s+unnaru\b/i,
      /\bem\s+jarigindi\b/i,
      /\bnidra\b|\bnidhra\b|\bnidhara\b/i,
      /\bosthundi\b|\bosthundhi\b|\bvasthundi\b|\bvastundi\b/i,
      /\bnidra\s+osthundi\b|\bnidhara\s+osthundhi\b/i,
      /\bcheppandi\b|\bcheppu\b/i,
      /\btelugu\s*(lo|language)\b/i,
      /\b(in|reply in|answer in|speak in)\s+telugu\b/i,
    ];
    if (teluguRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.TELUGU;
    }

    const malayalamRomanPatterns = [
      /\bente\s+peru\b/i,
      /\bsukhamano\b|\bningal\s+sukhamano\b/i,
      /\benthaanu\b|\bentha\b/i,
      /\bparayu\b/i,
      /\bmalayalam\s*(il|language)\b/i,
      /\b(in|reply in|answer in|speak in)\s+malayalam\b/i,
    ];
    if (malayalamRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.MALAYALAM;
    }

    const kannadaRomanPatterns = [
      /\bnamaskara\b/i,
      /\bnimma\s+hesaru\s+yenu\b/i,
      /\bhegiddira\b|\bhegiddiya\b/i,
      /\bheli\b|\btilisi\b/i,
      /\bkannada\s*(dalli|language)\b/i,
      /\b(in|reply in|answer in|speak in)\s+kannada\b/i,
    ];
    if (kannadaRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.KANNADA;
    }

    const bengaliRomanPatterns = [
      /\bnomoskar\b|\bnomoshkar\b/i,
      /\bapnar\s+nam\s+ki\b/i,
      /\bkemon\s+acho\b|\bkemon\s+achen\b/i,
      /\bki\s+hoyeche\b/i,
      /\bbangla\b|\bbengali\s*(te|language)\b/i,
      /\b(in|reply in|answer in|speak in)\s+bengali\b/i,
    ];
    if (bengaliRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.BENGALI;
    }

    const marathiRomanPatterns = [
      /\bnamaskar\b/i,
      /\btumcha\s+naav\s+kay\b/i,
      /\bkasa\s+ahes\b|\bkashi\s+ahes\b|\bkase\s+aahat\b/i,
      /\bkay\s+zala\b/i,
      /\bmarathi\s*(madhe|language)\b/i,
      /\b(in|reply in|answer in|speak in)\s+marathi\b/i,
    ];
    if (marathiRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.MARATHI;
    }

    const gujaratiRomanPatterns = [
      /\bkem\s+cho\b/i,
      /\btamaru\s+naam\s+shu\b/i,
      /\bsaru\s+che\b/i,
      /\bgujarati\s*(ma|language)\b/i,
      /\b(in|reply in|answer in|speak in)\s+gujarati\b/i,
    ];
    if (gujaratiRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.GUJARATI;
    }

    const punjabiRomanPatterns = [
      /\bsat\s+sri\s+akal\b/i,
      /\btuhada\s+naa[mn]\s+ki\b/i,
      /\bki\s+haal\s+aa\b/i,
      /\bpunjabi\s*(vich|language)\b/i,
      /\b(in|reply in|answer in|speak in)\s+punjabi\b/i,
    ];
    if (punjabiRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.PUNJABI;
    }

    const spanishRomanPatterns = [
      /\bhola\b|\bcomo\s+estas\b|\bque\s+tal\b|\bgracias\b/i,
      /\bespanol\b|\bespañol\b/i,
      /\b(in|reply in|answer in|speak in)\s+spanish\b/i,
    ];
    if (spanishRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.SPANISH;
    }

    const frenchRomanPatterns = [
      /\bbonjour\b|\bcomment\s+ca\s+va\b|\bmerci\b/i,
      /\bfrancais\b|\bfrançais\b/i,
      /\bchoses\b|\bcelebre\b|\bcelebres\b|\bparis\b|\bfrance\b/i,
      /\b(in|reply in|answer in|speak in)\s+french\b/i,
    ];
    if (frenchRomanPatterns.some((pattern) => pattern.test(normalizedAscii))) {
      return Language.FRENCH;
    }

    const germanRomanPatterns = [
      /\bhallo\b|\bwie\s+geht\s+es\b|\bdanke\b/i,
      /\bdeutsch\b/i,
      /\b(in|reply in|answer in|speak in)\s+german\b/i,
    ];
    if (germanRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.GERMAN;
    }

    const portugueseRomanPatterns = [
      /\bola\b|\bcomo\s+vai\b|\bobrigado\b|\bobrigada\b/i,
      /\bportugues\b|\bportuguês\b/i,
      /\b(in|reply in|answer in|speak in)\s+portuguese\b/i,
    ];
    if (portugueseRomanPatterns.some((pattern) => pattern.test(normalized))) {
      return Language.PORTUGUESE;
    }

    const lexicalHints: Array<{ language: Language; tokens: string[] }> = [
      { language: Language.TAMIL, tokens: ['vanakkam', 'enna', 'epdi', 'eppadi', 'irukku', 'sollu', 'nandri', 'romba', 'theriyuma'] },
      { language: Language.HINDI, tokens: ['namaste', 'kaise', 'kya', 'aap', 'hai', 'dhanyavaad', 'shukriya', 'mera', 'tum'] },
      { language: Language.TELUGU, tokens: ['ela', 'unnav', 'unnaru', 'nidra', 'nidhara', 'osthundi', 'osthundhi', 'cheppu', 'cheppandi', 'naaku'] },
      { language: Language.MALAYALAM, tokens: ['sukhamano', 'ente', 'entha', 'parayu', 'nanni', 'ningal'] },
      { language: Language.KANNADA, tokens: ['namaskara', 'nimma', 'hesaru', 'hegidira', 'heli', 'tilisi', 'yenu'] },
      { language: Language.BENGALI, tokens: ['nomoskar', 'kemon', 'apnar', 'nam', 'bangla', 'dhonnobad', 'ki'] },
      { language: Language.MARATHI, tokens: ['namaskar', 'tumcha', 'naav', 'kay', 'kasa', 'aahes', 'baray'] },
      { language: Language.GUJARATI, tokens: ['kem', 'cho', 'tamaru', 'naam', 'shu', 'majama', 'saru'] },
      { language: Language.PUNJABI, tokens: ['sat', 'sri', 'akal', 'tuhada', 'naa', 'haal', 'ki'] },
      { language: Language.SPANISH, tokens: ['hola', 'gracias', 'como', 'estas', 'que', 'tal', 'por', 'favor'] },
      { language: Language.FRENCH, tokens: ['bonjour', 'merci', 'comment', 'ca', 'va', 'choses', 'celebre', 'celebres', 'paris', 'france'] },
      { language: Language.GERMAN, tokens: ['hallo', 'danke', 'wie', 'geht', 'es', 'bitte'] },
      { language: Language.PORTUGUESE, tokens: ['ola', 'obrigado', 'obrigada', 'como', 'vai', 'por', 'favor'] },
    ];

    let bestLanguage: Language | null = null;
    let bestScore = 0;
    for (const hint of lexicalHints) {
      const score = hint.tokens.reduce((count, token) => {
        const tokenRegex = new RegExp(`\\b${token}\\b`, 'i');
        return count + (tokenRegex.test(normalizedAscii) ? 1 : 0);
      }, 0);
      if (score > bestScore) {
        bestScore = score;
        bestLanguage = hint.language;
      }
    }

    if (bestLanguage && bestScore >= 2) {
      return bestLanguage;
    }

    return null;
  };

  const inferNarrationPersonaFromRequest = (text: string): Settings['narrationType'] => {
    const normalized = (text || '').toLowerCase();
    if (/\b(personalized|personalise|personalize|my profile|based on my profile|for me personally)\b/.test(normalized)) {
      return 'Personalized';
    }
    if (/\b(use\s*case|case\s*study|framework|strategy|practical|action\s*plan|roadmap|competitor|market\s*analysis|go\s*to\s*market|execution)\b/.test(normalized)) {
      return 'Practical';
    }
    if (/\b(explain|teach|learning|learn|steps?|guide|tutorial|definition|overview)\b/.test(normalized)) {
      return 'Educational';
    }
    return 'Realistic';
  };

  const syncDetectedLanguageAndPersona = (language: Language, requestText: string) => {
    const inferredPersona = inferNarrationPersonaFromRequest(requestText);
    activeNarrationTypeRef.current = settings.narrationType === 'Personalized' ? 'Personalized' : inferredPersona;
    setSettings((prev) => {
      const nextPersona = prev.narrationType === 'Personalized' ? 'Personalized' : inferredPersona;
      if (prev.language === language && prev.narrationType === nextPersona) {
        return prev;
      }
      return {
        ...prev,
        language,
        narrationType: nextPersona,
      };
    });
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

  const detectAudioMimeType = (base64: string): string => {
    const normalized = (base64 || '').trim();
    const dataUrlMatch = normalized.match(/^data:([^;]+);base64,/i);
    if (dataUrlMatch?.[1]) return dataUrlMatch[1];

    try {
      const clean = normalized.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
      if (!clean) return 'audio/mpeg';
      const headerBytes = decodeAudio(clean).slice(0, 16);
      if (headerBytes.length >= 4) {
        const headerAscii = String.fromCharCode(...headerBytes.slice(0, 4));
        if (headerAscii === 'RIFF') return 'audio/wav';
        if (headerAscii === 'OggS') return 'audio/ogg';
      }
      if (headerBytes.length >= 3) {
        const id3 = String.fromCharCode(...headerBytes.slice(0, 3));
        if (id3 === 'ID3') return 'audio/mpeg';
      }
      if (headerBytes.length >= 2 && headerBytes[0] === 0xff && (headerBytes[1] & 0xe0) === 0xe0) {
        return 'audio/mpeg';
      }
    } catch {
      // ignore parse errors and use default
    }

    return 'audio/mpeg';
  };

  const getTtsExcerpt = (text: string, mode: "read" | "listen") => {
    const cleaned = cleanTextForTts(text);
    const baseText = cleaned || text;

    if (mode === 'read' && settings.narrationType === 'Educational') {
      const normalized = baseText.replace(/\s+/g, ' ').trim();
      if (!normalized) return baseText;

      const sentences = normalized
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);

      const isLongEducationalResponse = normalized.length > 900 || sentences.length > 8;
      if (isLongEducationalResponse) {
        const summary = sentences.slice(0, 5).join(' ');
        return summary.length > 650 ? `${summary.slice(0, 650).trimEnd()}...` : summary;
      }
    }

    return baseText;
  };

  const getNarrationStyleRate = (style: Settings["narrationType"]) => {
    if (style === "Practical") return 1.0;
    if (style === "Educational") return 0.98;
    if (style === "Personalized") return 1.0;
    return 1.0;
  };

  const getNarrationStylePitch = (style: Settings["narrationType"]) => {
    if (style === "Practical") return -1;
    if (style === "Educational") return 0;
    if (style === "Personalized") return -1;
    return -1;
  };

  useEffect(() => {
    activeNarrationTypeRef.current = settings.narrationType;
  }, [settings.narrationType]);

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

  const playAudioChunk = async (base64: string, mimeType?: string) => {
    initAudio();

    // Try Web Audio API first (supports analyser for visualisation)
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        try { await audioContextRef.current.resume(); } catch {}
      }

      try { window.speechSynthesis.cancel(); } catch {}

      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch {}
        try { currentSourceRef.current.disconnect(); } catch {}
        currentSourceRef.current = null;
      }

      try {
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
        return; // success via Web Audio API
      } catch (webAudioError) {
        console.warn('Web Audio API playback failed, falling back to HTML5 Audio:', webAudioError);
      }
    }

    // Fallback: HTML5 Audio element — works when decodeAudioData fails
    await new Promise<void>((resolve, reject) => {
      try {
        const resolvedMimeType = mimeType || detectAudioMimeType(base64);
        const audio = new Audio(`data:${resolvedMimeType};base64,${base64}`);
        audio.onended = () => resolve();
        audio.onerror = (e) => {
          console.error('HTML5 Audio fallback also failed:', e);
          reject(new Error('Audio playback failed'));
        };
        audio.play().catch(reject);
      } catch (err) {
        reject(err);
      }
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

    const chunkTimeoutMs = 15000;
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
        let audioPayload: TtsAudioPayload = { audio: '', mimeType: 'audio/mpeg' };
        try {
          audioPayload = await withTimeout(generateNarrationAudio(chunk, voiceProfile), chunkTimeoutMs);
        } catch (error) {
          if (error instanceof Error && error.message === 'TTS timeout') {
            return 'timeout';
          }
          throw error;
        }
        if (!audioPayload.audio) throw new Error('Empty TTS audio chunk');
        if (!hasStartedNarration) {
          hasStartedNarration = true;
          options?.onStart?.();
          if (options?.listenMode) {
            stopRecognition();
            setListenStatus('narrating');
            startAmbientMusic(options.genre || null);
          }
        }
        await playAudioChunk(audioPayload.audio, audioPayload.mimeType);
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
    if (profile.tone === "intense") return "Practical";
    if (profile.tone === "calm") return "Educational";
    return fallback;
  };

  const getTtsProviderOrder = (provider: TextToSpeechProvider) => {
    if (provider === TextToSpeechProvider.GEMINI) {
      return [TextToSpeechProvider.GEMINI, TextToSpeechProvider.ELEVENLABS, TextToSpeechProvider.GOOGLE];
    }
    if (provider === TextToSpeechProvider.GOOGLE) {
      return [TextToSpeechProvider.GOOGLE, TextToSpeechProvider.ELEVENLABS];
    }
    if (provider === TextToSpeechProvider.ELEVENLABS) {
      return [TextToSpeechProvider.ELEVENLABS, TextToSpeechProvider.GEMINI, TextToSpeechProvider.GOOGLE];
    }
    if (provider === TextToSpeechProvider.OPENAI) {
      return [TextToSpeechProvider.OPENAI, TextToSpeechProvider.GEMINI];
    }
    // Default: Gemini first, ElevenLabs fallback, Google last resort
    return [TextToSpeechProvider.GEMINI, TextToSpeechProvider.ELEVENLABS, TextToSpeechProvider.GOOGLE];
  };

  const generateNarrationAudio = async (text: string, voiceProfile?: VoiceProfile): Promise<TtsAudioPayload> => {
    const narrationLanguage = activeLanguageRef.current || Language.ENGLISH;
    const effectiveNarrationType = toVoiceNarrationType(voiceProfile, activeNarrationTypeRef.current || settings.narrationType);
    const providerOrder = getTtsProviderOrder(settings.ttsProvider);
    const googleLanguageCode = getGoogleLanguageCode(narrationLanguage);
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
    const googleRate = narrationLanguage === Language.ENGLISH
      ? paceRate
      : Math.max(0.7, Math.min(1.1, paceRate * 0.9));

    for (const provider of providerOrder) {
      if (provider === TextToSpeechProvider.GEMINI) {
        try {
          const geminiAudio = await generateSpeechWithGemini(
            text,
            settings.voiceType,
            narrationLanguage,
            settings.voiceGender
          );
          if (geminiAudio.audio) return { audio: geminiAudio.audio, mimeType: geminiAudio.mimeType || 'audio/wav' };
        } catch (error) {
          console.warn('Gemini TTS failed:', error);
        }
      }

      if (provider === TextToSpeechProvider.GOOGLE) {
        try {
          const googleAudio = await generateSpeechWithGoogle(
            text,
            googleVoiceName,
            googleLanguageCode,
            googleRate,
            pitchValue
          );
          if (googleAudio.audio) return { audio: googleAudio.audio, mimeType: googleAudio.mimeType || 'audio/mpeg' };
        } catch (error) {
          console.warn('Google TTS failed:', error);
        }
      }

      if (provider === TextToSpeechProvider.ELEVENLABS) {
        try {
          const elevenLabsAudio = await generateSpeechWithElevenLabs(
            text,
            settings.voiceType,
            narrationLanguage,
            effectiveNarrationType,
            settings.voiceGender
          );
          if (elevenLabsAudio.audio) return { audio: elevenLabsAudio.audio, mimeType: elevenLabsAudio.mimeType || 'audio/mpeg' };
        } catch (error) {
          console.warn('ElevenLabs TTS failed:', error);
        }
      }

      if (provider === TextToSpeechProvider.OPENAI) {
        try {
          const openAIAudio = await generateSpeechDetailed(text, settings.voiceType, narrationLanguage);
          if (openAIAudio.audio) return { audio: openAIAudio.audio, mimeType: openAIAudio.mimeType || 'audio/mpeg' };
        } catch (error) {
          console.warn('OpenAI TTS failed:', error);
        }
      }
    }

    return { audio: '', mimeType: 'audio/mpeg' };
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
    activeNarrationTypeRef.current = effectiveNarrationType;
    const baseRate = getNarrationStyleRate(effectiveNarrationType);
    const paceMultiplier = options?.voiceProfile?.pace === 'fast' ? 1.12 : options?.voiceProfile?.pace === 'slow' ? 0.92 : 1.0;
    const slangMultiplier = options?.voiceProfile?.slang === 'moderate' ? 1.04 : options?.voiceProfile?.slang === 'light' ? 1.02 : 1.0;
    const computedRate = Math.max(0.7, Math.min(1.3, baseRate * paceMultiplier * slangMultiplier));
    const basePitch = getNarrationStylePitch(effectiveNarrationType);
    const profilePitch = options?.voiceProfile?.pitch === 'high' ? 0.15 : options?.voiceProfile?.pitch === 'low' ? -0.15 : 0;
    const computedPitch = Math.max(0.6, Math.min(1.4, 1 + (basePitch + profilePitch) / 10));

    const chunks = splitTextForTts(text, 1200);
    const lang = languageMap[activeLanguageRef.current || Language.ENGLISH] || 'en-US';
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
    listenRealisticFollowUpRef.current = null;
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
    listenRealisticFollowUpRef.current = null;
    setSelectedHistory(null);
    setSelectedHistoryId(null);
  };

  const startNewChatSession = useCallback((resetTool: boolean = true) => {
    resetMessageUiState();
    stopNarrationForUiChange();
    activeReadSessionIdRef.current = null;
    setMessages([]);
    setInputValue('');
    if (resetTool) {
      setSelectedTool(null);
    }
    setReadSuggestions([]);
    setSelectedHistory(null);
    setSelectedHistoryId(null);
    setIsMobileJumpOpen(false);
  }, [resetMessageUiState, stopNarrationForUiChange]);

  const detectRequestedDocumentFormat = (query: string): 'pdf' | 'docx' | 'xlsx' | 'markdown' => {
    const lower = query.toLowerCase();
    if (/(\bdocx\b|\bword\b|\bdoc\b)/i.test(lower)) return 'docx';
    if (/(\bxlsx\b|\bexcel\b|spreadsheet|worksheet|table file)/i.test(lower)) return 'xlsx';
    if (/(\bmd\b|markdown)/i.test(lower)) return 'markdown';
    return 'pdf';
  };

  const parseRequestedFileSizeKB = (query: string): number | undefined => {
    const match = query.match(/(\d+(?:\.\d+)?)\s*(kb|mb|gb)\b/i);
    if (!match) return undefined;
    const value = Number(match[1]);
    const unit = (match[2] || '').toLowerCase();
    if (!Number.isFinite(value) || value <= 0) return undefined;
    if (unit === 'gb') return Math.round(value * 1024 * 1024);
    if (unit === 'mb') return Math.round(value * 1024);
    return Math.round(value);
  };

  const buildDocumentTitle = (query: string): string => {
    const normalized = (query || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) return 'Research Report';

    const withoutTrailingPunctuation = normalized.replace(/[,:;\-–—]+$/g, '').trim();
    const words = withoutTrailingPunctuation.split(' ').filter(Boolean).slice(0, 12);
    const compactTitle = words.join(' ').trim();

    return (compactTitle || 'Research Report').slice(0, 72);
  };

  const decodeAttachmentText = (file: { name: string; base64?: string }): string | null => {
    if (!file.base64) return null;
    const lowerName = file.name.toLowerCase();
    if (!/(\.txt|\.md|\.csv|\.json|\.log)$/i.test(lowerName)) return null;
    try {
      const binary = atob(file.base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return decoded.slice(0, 12000);
    } catch {
      return null;
    }
  };

  const isLikelyMobileDevice = () => (
    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
    || window.matchMedia('(max-width: 768px)').matches
  );

  const triggerBase64FileDownload = (
    base64Data: string,
    fileName: string,
    mimeType: string,
  ): { viewUrl?: string; downloaded: boolean; mobileFallback: boolean } => {
    try {
      const binary = atob(base64Data);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);

      const isMobile = isLikelyMobileDevice();

      if (isMobile) {
        return { viewUrl: objectUrl, downloaded: false, mobileFallback: true };
      }

      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return { viewUrl: objectUrl, downloaded: true, mobileFallback: false };
    } catch {
      const anchor = document.createElement('a');
      anchor.href = `data:${mimeType};base64,${base64Data}`;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return { viewUrl: anchor.href, downloaded: true, mobileFallback: false };
    }
  };

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

  const isEditableCanvasRequested = (query: string) => {
    const normalized = query.toLowerCase();
    return /(editable\s+canvas|digital\s+note\s+canvas|canvas\s+json|canvas\s+block|in\s+canvas\s+format|use\s+canvas\s+format)/.test(normalized);
  };

  const isStructuredOcrOutputRequested = (query: string) => {
    const normalized = (query || '').toLowerCase();
    return /(digital\s+note|notes?|summari[sz]e|explain|structured|format|clean\s+up|table|diagram|flowchart|mind\s*map|editable|canvas)/.test(normalized);
  };

  const extractCopyReadyText = (raw: string) => {
    const source = sanitizeNarrationForDisplay(raw);

    const maybeJsonPayload = source.trim();
    if (maybeJsonPayload.startsWith('{') && maybeJsonPayload.endsWith('}')) {
      try {
        const parsed = JSON.parse(maybeJsonPayload) as { content?: string };
        if (typeof parsed?.content === 'string' && parsed.content.trim()) {
          return parsed.content.trim();
        }
      } catch {
      }
    }

    const canvasUnwrapped = source.replace(/```canvas\s*([\s\S]*?)```/gi, (_, block: string) => {
      const text = block.trim();
      if (!text) return '';
      try {
        const parsed = JSON.parse(text) as { content?: string };
        return parsed?.content ? String(parsed.content) : text;
      } catch {
        return text;
      }
    });

    return canvasUnwrapped
      .replace(/```(?:diagram|mermaid|chart|json-chart|table|progress|tabs)?\s*([\s\S]*?)```/gi, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/^\|(?:\s*[-:]+\s*\|)+\s*$/gm, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const normalizeOcrDigitalNotes = (text: string) => {
    const stripMermaidParserNoise = (input: string) => {
      return String(input || '')
        .replace(/^.*syntax\s+error\s+in\s+text.*$/gim, '')
        .replace(/^.*mermaid\s+version\s+\d+\.\d+\.\d+.*$/gim, '')
        .replace(/^.*error\s+icon.*$/gim, '')
        .replace(/^.*id\s*=\s*"error".*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    };

    const collapseCharacterWrappedLines = (input: string) => {
      const lines = input.split(/\r?\n/);
      const output: string[] = [];

      const isCharacterLine = (line: string) => {
        const compact = line.replace(/\s+/g, '').trim();
        if (!compact) return false;
        if (compact.length > 2) return false;
        return /^[A-Za-z0-9+\-*/=(){}[\]\\^_.,:;<>|]+$/.test(compact);
      };

      let index = 0;
      while (index < lines.length) {
        if (!isCharacterLine(lines[index])) {
          output.push(lines[index]);
          index += 1;
          continue;
        }

        const sequence: string[] = [];
        let cursor = index;
        while (cursor < lines.length && isCharacterLine(lines[cursor])) {
          sequence.push(lines[cursor].replace(/\s+/g, '').trim());
          cursor += 1;
        }

        if (sequence.length >= 6) {
          output.push(sequence.join(''));
          index = cursor;
          continue;
        }

        output.push(...lines.slice(index, cursor));
        index = cursor;
      }

      return output.join('\n');
    };

    const preserveSegments = (input: string, pattern: RegExp, store: string[]) => {
      return input.replace(pattern, (segment) => {
        const token = `@@OCR_PRESERVE_${store.length}@@`;
        store.push(segment);
        return token;
      });
    };

    const restoreSegments = (input: string, store: string[]) => {
      let restored = input;
      store.forEach((segment, index) => {
        const token = `@@OCR_PRESERVE_${index}@@`;
        restored = restored.split(token).join(segment);
      });
      return restored;
    };

    const stripMarkdownAsterisks = (input: string) => {
      const preserved: string[] = [];
      let working = input;
      working = preserveSegments(working, /```[\s\S]*?```/g, preserved);
      working = preserveSegments(working, /\$\$[\s\S]*?\$\$/g, preserved);
      working = preserveSegments(working, /\$(?:\\.|[^$\n])+\$/g, preserved);

      const normalized = working
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/^\s*\*\s+/gm, '- ')
        .replace(/^\s*\*\s*$/gm, '')
        .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2');

      return restoreSegments(normalized, preserved);
    };

    const source = stripMermaidParserNoise((text || '').trim());

    if (source.startsWith('{') && source.endsWith('}')) {
      try {
        const parsed = JSON.parse(source) as { content?: string };
        if (typeof parsed?.content === 'string' && parsed.content.trim()) {
          return collapseCharacterWrappedLines(
            stripMarkdownAsterisks(stripMermaidParserNoise(parsed.content))
            .replace(/\r\n/g, '\n')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\[(?:REMO|NOISE|GARBLED|UNCLEAR)\]/gi, '')
            .replace(/\n{4,}/g, '\n\n')
            .replace(/\n{4,}/g, '\n\n')
            .trim()
          );
        }
      } catch {
      }
    }

    return collapseCharacterWrappedLines(
      stripMarkdownAsterisks(stripMermaidParserNoise(source))
            .replace(/\r\n/g, '\n')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\[(?:REMO|NOISE|GARBLED|UNCLEAR)\]/gi, '')
            .replace(/\n{4,}/g, '\n\n')
        .trim()
    );
  };

  const isUnavailableNarrative = (text: string) => {
    const normalized = (text || '').trim().toLowerCase();
    if (!normalized) return true;
    if (/^sorry\s*[—-]\s*.*ai is unavailable right now\.?$/i.test(normalized)) {
      return true;
    }
    return (
      normalized === 'sorry — ai is unavailable right now.' ||
      normalized === 'sorry - ai is unavailable right now.' ||
      normalized.includes('document generation failed: ai content is unavailable right now') ||
      normalized.includes('document generation failed') ||
      normalized.includes('please try again in a moment') ||
      normalized.includes('encountered an error while generating') ||
      normalized.includes('i could not generate the document right now') ||
      normalized.includes('all ai models failed to generate a response') ||
      normalized.includes('ai content is unavailable right now') ||
      normalized.includes('api key not configured') ||
      normalized.includes('service is unavailable right now')
    );
  };

  const isDashboardSessionSuggestionMessage = (msg: ChatMessage) => {
    if (msg.role !== 'assistant' || !!msg.dashboard) return false;
    const normalized = (msg.content || '').toLowerCase();
    return (
      normalized.includes('dashboard session') ||
      normalized.includes('ready to assist with dashboard creation') ||
      normalized.includes('query presets you can use directly')
    );
  };

  useEffect(() => {
    if (selectedTool !== 'dashboard') {
      setDashboardLlmSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const latestDashboardUserQuery = [...messages]
          .reverse()
          .find((entry) => entry.role === 'user')?.content?.trim() || '';

        const requestQuery = inputValue.trim() || latestDashboardUserQuery || 'Create a dashboard with useful customizations';

        const latestUserWithAttachments = [...messages]
          .reverse()
          .find((entry) => entry.role === 'user' && Array.isArray(entry.attachments) && entry.attachments.length > 0);

        const attachments = latestUserWithAttachments?.attachments || [];
        const datasetHeaders = attachments.flatMap((file) => {
          if (!file?.data) return [] as string[];
          const lowerName = String(file.name || '').toLowerCase();
          const isCsvLike = /\.csv$|\.txt$/.test(lowerName) || /csv|text\//i.test(String(file.type || ''));
          if (!isCsvLike) return [] as string[];

          try {
            const binary = atob(file.data);
            const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
            const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes).slice(0, 4000);
            const firstDataLine = decoded
              .split(/\r?\n/)
              .map((line) => line.trim())
              .find((line) => line.length > 0);
            if (!firstDataLine) return [] as string[];
            return firstDataLine
              .split(',')
              .map((cell) => cell.replace(/^"|"$/g, '').trim())
              .filter(Boolean)
              .slice(0, 12);
          } catch {
            return [] as string[];
          }
        });

        const uniqueHeaders = datasetHeaders.filter((header, index, list) => list.indexOf(header) === index).slice(0, 20);

        const chatHistory = messages
          .slice(-8)
          .map((entry) => ({ role: entry.role, content: entry.content }));

        const generated = await generateDashboardSuggestions(requestQuery, chatHistory, uniqueHeaders);
        if (!cancelled) {
          setDashboardLlmSuggestions(generated.slice(0, 6));
          if (generated.length > 0) {
            setReadSuggestions(generated.slice(0, 3));
          }
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedTool, inputValue, messages]);

  const dashboardChatSuggestionPills = useMemo(() => {
    if (selectedTool !== 'dashboard') return [] as string[];

    const latestDashboardUserQuery = [...messages]
      .reverse()
      .find((entry) => entry.role === 'user')?.content?.trim() || '';

    const latestDashboardAssistantText = [...messages]
      .reverse()
      .find((entry) => entry.role === 'assistant')?.content?.trim() || '';

    const queryLower = latestDashboardUserQuery.toLowerCase();
    const assistantLower = latestDashboardAssistantText.toLowerCase();

    const lastUserWithAttachments = [...messages]
      .reverse()
      .find((entry) => entry.role === 'user' && Array.isArray(entry.attachments) && entry.attachments.length > 0);

    const attached = lastUserWithAttachments?.attachments || [];

    const decodeTextHeaders = (file: { name: string; type: string; data?: string }): string[] => {
      if (!file.data) return [];
      const lowerName = file.name.toLowerCase();
      const isCsvLike =
        /\.csv$|\.txt$/.test(lowerName)
        || /csv|text\//i.test(file.type || '');
      if (!isCsvLike) return [];

      try {
        const binary = atob(file.data);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes).slice(0, 4000);
        const firstDataLine = decoded
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line.length > 0);
        if (!firstDataLine) return [];
        return firstDataLine
          .split(',')
          .map((cell) => cell.replace(/^"|"$/g, '').trim())
          .filter(Boolean)
          .slice(0, 8);
      } catch {
        return [];
      }
    };

    const headerCandidates = attached.flatMap((file) => decodeTextHeaders(file));
    const uniqueHeaders = headerCandidates.filter((header, index, list) => list.indexOf(header) === index);

    const metricRegex = /(sales|revenue|amount|total|count|cost|price|profit|value|score|quantity|units?)/i;
    const metricHeader = uniqueHeaders.find((header) => metricRegex.test(header));
    const dimensionHeader = uniqueHeaders.find((header) => !metricRegex.test(header));
    const secondDimensionHeader = uniqueHeaders.find((header) => header !== dimensionHeader && !metricRegex.test(header));

    const stopWords = new Set([
      'show', 'add', 'with', 'for', 'from', 'into', 'over', 'under', 'and', 'the', 'this', 'that',
      'dashboard', 'table', 'chart', 'charts', 'kpi', 'cards', 'data', 'dataset', 'report', 'analysis',
    ]);
    const queryTokens = latestDashboardUserQuery
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !stopWords.has(token));

    const inferredMetric = metricHeader || queryTokens.find((token) => metricRegex.test(token));
    const inferredDimension = dimensionHeader || queryTokens.find((token) => token !== inferredMetric);

    const hashSeed = (value: string): number => {
      let hash = 0;
      for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
      }
      return Math.abs(hash);
    };

    const pills: string[] = [];
    const tablePills: string[] = [];
    const chartPills: string[] = [];
    const kpiPills: string[] = [];
    const filterPills: string[] = [];
    const layoutPills: string[] = [];

    if (metricHeader && dimensionHeader) {
      chartPills.push(`Show total ${metricHeader} by ${dimensionHeader}`);
      chartPills.push(`Top 10 ${dimensionHeader} by ${metricHeader}`);
      filterPills.push(`Add filter by ${dimensionHeader} and sort ${metricHeader} descending`);
    }

    if (metricHeader && secondDimensionHeader) {
      chartPills.push(`Compare ${metricHeader} across ${secondDimensionHeader}`);
    }

    const timeHeader = uniqueHeaders.find((header) => /(date|day|week|month|quarter|year|time)/i.test(header));
    if (metricHeader && timeHeader) {
      chartPills.push(`Show ${metricHeader} trend by ${timeHeader} with month-over-month change`);
    }

    if (/pie|donut/.test(queryLower + ' ' + assistantLower) && metricHeader && dimensionHeader) {
      chartPills.push(`Switch to bar chart for ${dimensionHeader} vs ${metricHeader}`);
    } else if (/line|trend/.test(queryLower + ' ' + assistantLower) && metricHeader && dimensionHeader) {
      chartPills.push(`Switch to pie chart share for ${dimensionHeader}`);
    } else if (metricHeader && dimensionHeader) {
      chartPills.push(`Use line chart for ${metricHeader} trend and bar chart for ${dimensionHeader} comparison`);
    }

    if (metricHeader) {
      kpiPills.push(`Include KPI cards for sum, median, and range of ${metricHeader}`);
    }

    if (!metricHeader && inferredMetric) {
      kpiPills.push(`Add KPI cards for total, average, and max ${inferredMetric}`);
    }

    if (!dimensionHeader && inferredDimension && inferredMetric) {
      chartPills.push(`Compare ${inferredMetric} across ${inferredDimension}`);
      filterPills.push(`Filter by ${inferredDimension} and highlight top ${inferredMetric}`);
    }

    const agGridContext = `${queryLower} ${assistantLower}`;
    if (metricHeader && dimensionHeader) {
      tablePills.push(`Table: group by ${dimensionHeader} and aggregate ${metricHeader}`);
    }
    if (/\bpivot|cross\s*-?tab\b/.test(agGridContext) && metricHeader) {
      tablePills.push(`Table: enable pivot mode with ${metricHeader} totals`);
    } else if (metricHeader) {
      tablePills.push(`Table: enable pivot mode for deeper ${metricHeader} breakdown`);
    }
    if (/\bfit\s*columns|auto\s*-?fit|size\s*to\s*fit\b/.test(agGridContext)) {
      tablePills.push('Table: auto-fit columns to available width');
    } else {
      tablePills.push('Table: auto-size columns based on content width');
    }
    if (!/\bstriped|zebra\b/.test(agGridContext)) {
      tablePills.push('Table: add striped rows and compact table density');
    }

    if (dimensionHeader) {
      filterPills.push(`Add dropdown filters for ${dimensionHeader}`);
    }

    if (!dimensionHeader && inferredDimension) {
      filterPills.push(`Add dropdown filters for ${inferredDimension}`);
      tablePills.push(`Table: group by ${inferredDimension} and show summary totals`);
    }

    layoutPills.push('Switch dashboard theme to executive style');
    layoutPills.push('Open table in fullscreen and keep charts concise');

    if (latestDashboardUserQuery) {
      filterPills.push(`Refine current query: ${latestDashboardUserQuery.slice(0, 50)} with advanced filters`);
      chartPills.push(`Create a focused chart for: ${latestDashboardUserQuery.slice(0, 52)}`);
      tablePills.push(`Table: sort by relevance to "${latestDashboardUserQuery.slice(0, 36)}"`);
    }

    const baseSequence = [
      ...chartPills,
      ...kpiPills,
      ...filterPills,
      ...tablePills,
      ...layoutPills,
    ].filter((pill): pill is string => Boolean(pill));

    const uniqueSequence = baseSequence.filter((pill, index, list) => list.indexOf(pill) === index);
    const seed = hashSeed(`${latestDashboardUserQuery}|${latestDashboardAssistantText}|${messages.length}`);
    const startIndex = uniqueSequence.length > 0 ? seed % uniqueSequence.length : 0;
    const mixedPills = uniqueSequence.length > 0
      ? [...uniqueSequence.slice(startIndex), ...uniqueSequence.slice(0, startIndex)]
      : [];

    pills.push(...mixedPills);

    if (!pills.length) {
      const fallbackFocus = latestDashboardUserQuery.slice(0, 40).trim();
      if (fallbackFocus) {
        pills.push(`Add filters and top 10 breakdown for ${fallbackFocus}`);
        pills.push(`Compare categories in ${fallbackFocus} and include KPI variance cards`);
        pills.push(`Show trend chart with drill-ready table for ${fallbackFocus}`);
      } else {
        pills.push('Add filters and top 10 breakdown with interactive table');
        pills.push('Compare categories and include variance and range KPI cards');
        pills.push('Show trend chart with drill-ready detailed table');
      }
    }

    return [...dashboardLlmSuggestions, ...pills]
      .filter((pill): pill is string => Boolean(pill && pill.trim()))
      .filter((pill, index, list) => list.indexOf(pill) === index)
      .slice(0, 8);
  }, [messages, selectedTool, dashboardLlmSuggestions]);

  const latestDashboardAssistantMessageId = useMemo(() => {
    if (selectedTool !== 'dashboard') return null;
    const latestAssistant = [...messages].reverse().find((entry) => entry.role === 'assistant');
    return latestAssistant?.id || null;
  }, [messages, selectedTool]);

  const handleCopyMessage = async (messageId: string, content: string) => {
    const canvasEditor = assistantContentRefs.current[messageId]?.querySelector('textarea[data-canvas-editor="true"]') as HTMLTextAreaElement | null;
    const textToCopy = canvasEditor?.value?.trim()
      ? canvasEditor.value.trim()
      : extractCopyReadyText(content);
    if (!textToCopy.trim()) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedMessageId(messageId);
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current));
      }, 1800);
    } catch (error) {
      console.error('Failed to copy response:', error);
    }
  };

  const handleOpenDocument = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShareDocument = async (url: string, fileName?: string, mimeType?: string) => {
    if (!navigator.share) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const sharedFileName = fileName || 'generated-document';
      const file = new File([blob], sharedFileName, { type: mimeType || blob.type || 'application/octet-stream' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: sharedFileName });
        return;
      }

      await navigator.share({
        title: sharedFileName,
        text: 'Generated document',
        url,
      });
    } catch (error) {
      console.error('Document share failed:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyDocumentLink = async (messageId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      const copyId = `${messageId}-doc-link`;
      setCopiedMessageId(copyId);
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        setCopiedMessageId((current) => (current === copyId ? null : current));
      }, 1800);
    } catch (error) {
      console.error('Failed to copy document link:', error);
    }
  };

  const registerAssistantContentNode = (id: string, node: HTMLDivElement | null) => {
    assistantContentRefs.current[id] = node;
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

  const buildBookSummarySuggestion = (query: string) => {
    const normalized = (query || '').toLowerCase();
    const mapping: Array<{ pattern: RegExp; title: string; focus: string }> = [
      {
        pattern: /(startup|product\s*market\s*fit|mvp|founder|saas|go\s*to\s*market|gtm)/i,
        title: 'The Lean Startup',
        focus: 'how to test assumptions and iterate quickly',
      },
      {
        pattern: /(marketing|brand|positioning|growth|acquisition|seo|content|campaign)/i,
        title: 'Obviously Awesome',
        focus: 'how to position clearly and differentiate in market',
      },
      {
        pattern: /(leadership|manager|team|culture|hiring|delegation|people)/i,
        title: 'The Making of a Manager',
        focus: 'how to manage teams and decision quality',
      },
      {
        pattern: /(sales|negotiation|closing|b2b|enterprise|pipeline)/i,
        title: 'SPIN Selling',
        focus: 'how to run consultative sales conversations',
      },
      {
        pattern: /(finance|cash\s*flow|budget|pricing|profit|unit\s*economics|valuation)/i,
        title: 'Financial Intelligence',
        focus: 'how to read numbers and make financially sound decisions',
      },
      {
        pattern: /(career|job|resume|interview|promotion|workplace|productivity)/i,
        title: 'Deep Work',
        focus: 'how to improve focus and high-value execution',
      },
      {
        pattern: /(habit|discipline|consistency|routine|motivation|self\s*improvement)/i,
        title: 'Atomic Habits',
        focus: 'how to build repeatable behavior change',
      },
      {
        pattern: /(e\s*commerce|ecommerce|shop|store|retail|d2c|inventory|supplier)/i,
        title: 'The E-Myth Revisited',
        focus: 'how to systemize operations and scale reliably',
      },
      {
        pattern: /(ai|machine\s*learning|automation|llm|data\s*science|analytics)/i,
        title: 'Competing in the Age of AI',
        focus: 'how to apply AI in business workflows and strategy',
      },
    ];

    const matched = mapping.find((item) => item.pattern.test(normalized));
    const title = matched?.title || 'The Personal MBA';
    const focus = matched?.focus || 'a practical decision framework for this problem';

    return `Summarize "${title}" and extract ${focus}.`;
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
    const detectedRequestLanguage = inferLanguageFromTranscript(userQuery) || activeLanguageRef.current || Language.ENGLISH;
    activeLanguageRef.current = detectedRequestLanguage;
    setRecognitionLanguageFor(detectedRequestLanguage);
    syncDetectedLanguageAndPersona(detectedRequestLanguage, userQuery);
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
    const shouldPersistToolSession = !['dashboard', 'document'].includes(selectedTool || '');

    if (shouldPersistToolSession) {
      setSelectedHistoryId(historyId);
    } else {
      setSelectedHistoryId(null);
    }
    setSelectedHistory(null);

    const existingItem = shouldPersistToolSession
      ? history.find((entry) => entry.id === historyId)
      : undefined;
    const existingConversation: HistoryConversationEntry[] = shouldPersistToolSession
      ? (existingItem?.conversation?.map((entry) => ({
          ...entry,
          role: entry.role as 'user' | 'assistant',
        })) || [])
      : [];

    const pendingHistoryItem: HistoryItem | null = shouldPersistToolSession
      ? {
          id: historyId,
          query: existingItem?.query || userQuery,
          mode: currentMode,
          interactionMode: "read",
          toolTag: selectedTool === 'ocr' ? 'OCR' : existingItem?.toolTag,
          timestamp: requestTimestamp,
          response: undefined,
          audioBlob: undefined,
          modelUsed: existingItem?.modelUsed,
          suggestions: existingItem?.suggestions,
          conversation: [...existingConversation, { role: 'user', content: userQuery, timestamp: requestTimestamp }],
        }
      : null;

    if (pendingHistoryItem) {
      upsertHistoryItem(pendingHistoryItem);
    }

    if (shouldPersistToolSession && isAuthenticated) {
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
          const imageAttachments = attachments
            .filter((file) => Boolean(file.base64) && String(file.type || '').toLowerCase().startsWith('image/'))
            .map((file) => ({
              type: file.type,
              data: file.base64 as string,
              name: file.name,
            }));
          const imageResponse = await generateToolImage(
            userQuery,
            selectedModel,
            undefined,
            imageConfig,
            imageAttachments
          );
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

          if (!imageResponse.imageUrl && imageResponse.error) {
            markModelUnavailable(selectedModel, imageResponse.error);
          }
        } else {
          const videoConfig = JSON.parse(sessionStorage.getItem('videoConfig') || '{}');
          // Default to Gemini Veo for video generation (best quality + availability)
          const videoModel = selectedModel === 'auto' ? 'veo-2.0-generate-001' : selectedModel;
          const videoResponse = await generateToolVideo(userQuery, videoModel, videoConfig);

          let resolvedVideoResponse = videoResponse;
          if (!videoResponse.videoUrl && (videoResponse.operationId || videoResponse.videoId) && (videoResponse.status === 'processing' || !videoResponse.error)) {
            // Poll up to 20 times with 5-second intervals = 100 seconds total (needed for Gemini video generation)
            for (let attempt = 0; attempt < 20; attempt++) {
              console.log(`[Video Polling] Attempt ${attempt + 1}/20, waiting 5 seconds before polling...`);
              await new Promise((resolve) => setTimeout(resolve, 5000));
              
              const polled = await pollToolVideoStatus({
                model: videoModel,
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

          if (!resolvedVideoResponse.videoUrl && resolvedVideoResponse.error) {
            markModelUnavailable(videoModel, resolvedVideoResponse.error);
          }
        }

        setMessages((prev) => [...prev, assistantMsg]);

        if (pendingHistoryItem) {
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
        }

        if (shouldPersistToolSession && isAuthenticated) {
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
        const modelForFailure = selectedTool === 'video'
          ? (selectedModel === 'auto' ? 'veo-2.0-generate-001' : selectedModel)
          : selectedModel;
        markModelUnavailable(
          modelForFailure,
          error instanceof Error ? error.message : 'api failure'
        );
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

    if (selectedTool === 'ocr') {
      setIsLoading(true);
      try {
        const filesForOcr = attachments.filter((file) => !!file.base64);
        const assistantTimestamp = new Date();

        if (!filesForOcr.length) {
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: 'Please attach an image or document file for OCR extraction.',
              timestamp: assistantTimestamp,
              animate: interactionModeRef.current === 'read',
            },
          ]);
          return;
        }

        const ocrEngineModel = selectedModel === 'ocr-extended-response' ? 'google-vision-ocr' : selectedModel;
        const extractedSections: Array<{ name: string; text: string; provider?: string }> = [];
        const failedFiles: Array<{ name: string; error: string }> = [];

        for (const file of filesForOcr) {
          const ocrResponse = await generateToolOCR(
            file.base64 as string,
            file.name,
            ocrEngineModel,
            { language: settings.language, mimeType: file.type }
          );

          if (ocrResponse.error) {
            failedFiles.push({ name: file.name, error: ocrResponse.error });
            markModelUnavailable(ocrEngineModel, ocrResponse.error);
            continue;
          }

          const extractedText = (ocrResponse.fullText || '').trim();
          if (extractedText) {
            extractedSections.push({
              name: file.name,
              text: extractedText,
              provider: ocrResponse.provider,
            });
          }
        }

        const formatSimpleOcrSection = (section: { name: string; text: string; provider?: string }) => {
          const providerLabel = section.provider || 'google-vision';
          const cleanedText = normalizeOcrDigitalNotes(
            section.text
              .replace(/^.*syntax\s+error\s+in\s+text.*$/gim, '')
              .replace(/^.*mermaid\s+version\s+\d+\.\d+\.\d+.*$/gim, '')
              .replace(/\n{3,}/g, '\n\n')
              .trim()
          );

          return [
            `File: ${section.name}`,
            `Provider: ${providerLabel}`,
            '',
            cleanedText || 'No readable text was detected in this file.',
          ].join('\n');
        };

        const extractedText = extractedSections
          .map((section) => formatSimpleOcrSection(section))
          .join('\n\n----------------------------------------\n\n');
        let assistantContent = extractedSections.length
          ? `OCR completed (${extractedSections[0]?.provider || 'google-vision'}) for ${extractedSections.length} file(s).\n\n${extractedText}`
          : failedFiles.length
            ? `OCR failed for all files.\n\n${failedFiles.map((item) => `${item.name}: ${item.error}`).join('\n')}`
            : 'OCR completed but no readable text was detected in the attached files.';

        const inAutoOcrMode = selectedModel === 'auto';
        const inExtendedOcrMode = selectedModel === 'ocr-extended-response';
        const wantsEditableCanvas = isEditableCanvasRequested(userQuery);
        const wantsStructuredOutput = isStructuredOcrOutputRequested(userQuery);
        const shouldGenerateExtendedResponse = extractedSections.length > 0
          && (inExtendedOcrMode || (inAutoOcrMode && (wantsStructuredOutput || wantsEditableCanvas)));

        if (shouldGenerateExtendedResponse) {
          const combinedExtractedText = extractedSections
            .map((section) => `[File: ${section.name}]\n${section.text}`)
            .join('\n\n');

          const clippedText = combinedExtractedText.length > 12000
            ? `${combinedExtractedText.slice(0, 12000)}\n\n[Text truncated for processing.]`
            : combinedExtractedText;

          const ocrAsRequest = `
User request:
${userQuery}

OCR extracted text from attached files:
${clippedText}

${failedFiles.length ? `Some files failed OCR:\n${failedFiles.map((item) => `- ${item.name}: ${item.error}`).join('\n')}` : ''}

Primary goal: satisfy the exact user request using the OCR content.
${inAutoOcrMode ? '- Auto mode rule: focus only on what the user explicitly asked; do not add extra sections.' : ''}
Requirements:
- Keep wording faithful to source notes; do not rewrite unless text is unreadable.
- Reconstruct layout using markdown sections and bullet hierarchy matching the source.
- Preserve formulas exactly as written in OCR text (including LaTeX/Unicode symbols); do not rewrite equation notation.
- Preserve any existing diagram syntax/code blocks as-is whenever present.
- If content is tabular, include markdown table(s).
- If the notes imply process/steps/flow, include a \`\`\`diagram code block in Mermaid syntax (for example: flowchart TD; A-->B;).
- If a visual/chart/canvas-like representation is needed, include a \`\`\`chart code block with JSON spec.
- Never output one-character-per-line text; merge broken OCR character-wrapped lines into readable sentences while preserving math and diagram text.
- Remove OCR artifacts and noisy symbols (stray **, isolated brackets, random placeholder tokens like [REMO]) unless clearly intentional in source.
- Use clean markdown only (headings, lists, tables, code blocks) with no decorative symbols.
- Include a short "Assumptions / Unclear OCR" section only when necessary.
${wantsEditableCanvas
? `- Since user requested editable notes: output exactly one \`\`\`canvas block.
- The canvas block MUST be JSON: {"title":"Digital note","content":"..."}
- In content, preserve the note design/layout and keep it readable/editable.
- Do not output any text outside the canvas block.`
: '- End with a "Digital note" section containing only the final consolidated notes.'}
`;

          const formatterModel = 'auto';
          let aiResponse = await generateNarrative(
            ocrAsRequest,
            currentMode,
            {
              ...settings,
              language: detectedRequestLanguage,
              narrationType: 'Educational',
            },
            [...messages.slice(-5), newUserMsg].map((m) => ({ role: m.role, content: m.content })),
            'read',
            {
              profile: userProfile || undefined,
              recentQueries: history.slice(0, 8).map((item) => item.query),
              attachments,
            },
            undefined,
            formatterModel
          );

          if (isUnavailableNarrative((aiResponse.narration || '').trim())) {
            aiResponse = await generateNarrative(
              ocrAsRequest,
              currentMode,
              {
                ...settings,
                language: detectedRequestLanguage,
                narrationType: 'Educational',
              },
              [...messages.slice(-5), newUserMsg].map((m) => ({ role: m.role, content: m.content })),
              'read',
              {
                profile: userProfile || undefined,
                recentQueries: history.slice(0, 8).map((item) => item.query),
                attachments,
              }
            );
          }

          for (const failedModel of aiResponse.failedModels || []) {
            markModelUnavailable(failedModel, 'api failure');
          }

          const detailedText = (aiResponse.narration || '').trim();
          const normalizedDetailedText = normalizeOcrDigitalNotes(detailedText);
          const hasUsableDigitalNote = !!normalizedDetailedText && !isUnavailableNarrative(normalizedDetailedText);
          assistantContent = hasUsableDigitalNote
            ? `✅ OCR completed for ${extractedSections.length} file(s).\n\nDigital note:\n\n${normalizedDetailedText}`
            : assistantContent;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: assistantContent,
            timestamp: assistantTimestamp,
            animate: interactionModeRef.current === 'read',
          },
        ]);

        if (pendingHistoryItem) {
          const updatedHistoryItem: HistoryItem = {
            ...pendingHistoryItem,
            response: assistantContent,
            conversation: [
              ...(pendingHistoryItem.conversation || []),
              {
                role: 'assistant',
                content: assistantContent,
                timestamp: assistantTimestamp,
              },
            ],
          };
          upsertHistoryItem(updatedHistoryItem);
        }
      } catch (error) {
        console.error('OCR session failed:', error);
        const errorText = error instanceof Error ? error.message : 'Unknown OCR error';
        const ocrEngineModel = selectedModel === 'ocr-extended-response' ? 'google-vision-ocr' : selectedModel;
        markModelUnavailable(ocrEngineModel, errorText);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: 'I ran into an error while extracting text. Please try again.',
            timestamp: new Date(),
            animate: interactionModeRef.current === 'read',
          },
        ]);
      } finally {
        setIsLoading(false);
      }

      return;
    }

    if (selectedTool === 'document') {
      setIsLoading(true);
      try {
        const requestedFormat = detectRequestedDocumentFormat(userQuery);
        const requestedSizeKB = parseRequestedFileSizeKB(userQuery);

        const extractedAttachmentText = attachments
          .map((attachment) => {
            const text = decodeAttachmentText(attachment);
            if (!text) return '';
            return `\n\n[Attachment: ${attachment.name}]\n${text}`;
          })
          .filter(Boolean)
          .join('');

        const reportPrompt = requestedFormat === 'xlsx'
          ? `${userQuery}

      You are generating data for spreadsheet export.
      Requirements:
      - Return ONLY tabular data as a markdown table.
      - First row must be column headers relevant to the request.
      - Include only requested list data (no report sections, no executive summary, no recommendations).
      - Keep each row concise and factual.
      - If attachments are provided, extract list/table rows from them.
      ${extractedAttachmentText}`
          : `${userQuery}

      You are generating a research-grade report document.
      Requirements:
      - Include: Title, Executive Summary, Method/Approach, Findings, Comparative Table, Chart Insights, Recommendations, and Conclusion.
      - Keep formatting clear and professional with strong indentation and section hierarchy.
      - Keep the title concise and wrap-safe (max 12 words, avoid long unbroken strings).
      - Keep title and section headings left-aligned with consistent indentation.
      - If attachments are provided, analyze them and include their insights in the report.
      - Ensure content is export-ready for ${requestedFormat.toUpperCase()} generation.
      ${requestedSizeKB ? `- Target file size: approximately ${requestedSizeKB} KB while preserving quality.` : ''}
      ${extractedAttachmentText}`;

        const docNarrative = await generateNarrative(
          reportPrompt,
          currentMode,
          { ...settings, language: detectedRequestLanguage },
          [...messages.slice(-5), newUserMsg].map((m) => ({ role: m.role, content: m.content })),
          'read',
          {
            profile: userProfile || undefined,
            recentQueries: history.slice(0, 8).map((item) => item.query),
            attachments,
          },
          undefined,
          selectedModel
        );
        for (const failedModel of docNarrative.failedModels || []) {
          markModelUnavailable(failedModel, 'api failure');
        }

        const generatedDocContent = (docNarrative.narration || '').trim();
        const isNarrativeUnavailable = isUnavailableNarrative(generatedDocContent);

        const fallbackDocContent = [
          `# ${buildDocumentTitle(userQuery)}`,
          '',
          '## Executive Summary',
          `This report is prepared from the request context: ${userQuery.trim() || 'N/A'}.`,
          '',
          '## Method/Approach',
          '- Interpreted the user intent and converted it into a structured report format.',
          '- Prioritized concise, actionable information relevant to the request.',
          ...(extractedAttachmentText
            ? [
                '',
                '## Attachment Insights',
                extractedAttachmentText.trim(),
              ]
            : []),
          '',
          '## Findings',
          '- Key points are organized based on the request scope and available context.',
          '- Recommended outputs should be validated with latest local/source data where needed.',
          '',
          '## Recommendations',
          '- Use this draft as a baseline and refine with any additional location-specific constraints.',
          '- Request a refreshed run with more context for deeper analysis.',
          '',
          '## Conclusion',
          'The document has been structured for export-ready use and further iteration.',
        ]
          .filter(Boolean)
          .join('\n');

        const docSourceContent = !generatedDocContent || isNarrativeUnavailable
          ? fallbackDocContent
          : generatedDocContent;

        const docResult = await generateToolDocument(
          docSourceContent,
          selectedModel,
          attachments,
          {
            format: requestedFormat,
            title: buildDocumentTitle(userQuery),
            style: 'professional',
            targetFileSizeKB: requestedSizeKB,
            fileName: `report-${Date.now()}.${requestedFormat === 'markdown' ? 'md' : requestedFormat}`,
          }
        );

        const assistantTimestamp = new Date();
        let assistantContent = 'I could not generate the document right now. Please try again.';
        let documentPayload: ChatMessage['document'] | undefined;
        if (docResult.fileBase64 && docResult.fileName && docResult.mimeType) {
          const downloadResult = triggerBase64FileDownload(docResult.fileBase64, docResult.fileName, docResult.mimeType);
          assistantContent = `✅ Document generated (${docResult.format?.toUpperCase() || requestedFormat.toUpperCase()}) and downloaded.`;
          if (downloadResult.viewUrl) {
            documentPayload = {
              url: downloadResult.viewUrl,
              fileName: docResult.fileName,
              mimeType: docResult.mimeType,
              summary: docResult.summary,
            };
            assistantContent = `✅ Document generated (${docResult.format?.toUpperCase() || requestedFormat.toUpperCase()}).`;
            if (downloadResult.mobileFallback) {
              assistantContent += '\n\nOn mobile, use Open, Share, or Copy Link to access the file.';
            }
          }
          if (docResult.summary) {
            assistantContent += `\n\n${docResult.summary}`;
          }
        } else if (docResult.error) {
          assistantContent = `Document generation failed: ${docResult.error}`;
          markModelUnavailable(selectedModel, docResult.error);
        }

        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: assistantContent,
          timestamp: assistantTimestamp,
          animate: interactionModeRef.current === 'read',
          document: documentPayload,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (error) {
        console.error('Document session failed:', error);
        markModelUnavailable(
          selectedModel,
          error instanceof Error ? error.message : 'api failure'
        );
        const errorMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'I ran into an error while generating the document. Please try again.',
          timestamp: new Date(),
          animate: interactionModeRef.current === 'read',
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }

      return;
    }

    if (selectedTool === 'dashboard') {
      setIsLoading(true);
      try {
        const attachmentSummary = attachments.length
          ? `Attached datasets (${attachments.length}):\n${attachments.map((file) => `- ${file.name}`).join('\n')}`
          : 'No attachments provided. Build from user intent and generated placeholders only when needed.';

        const dashboardPrompt = `User request:\n${userQuery.trim() || 'Create a responsive business dashboard from the uploaded data.'}

${attachmentSummary}

Dashboard rules:
- Build dynamically from the user query (do not force a fixed preset layout).
- Support custom chart type, KPI cards, metrics, dimensions, filters, grouping, sorting, comparison, and top-N requests.
- When multiple attachments are present, analyze them together and include cross-file comparison where useful.
- For large datasets, prioritize aggregated KPIs, performant defaults, and responsive rendering.
- Keep layout responsive for full-window dialog view.`;

        const dashboardResult = await generateToolDashboard(dashboardPrompt, attachments);

        const assistantTimestamp = new Date();
        let assistantContent = 'Dashboard creation failed. Please upload data and try again.';
        let dashboardPayload: ChatMessage['dashboard'] | undefined;

        if (dashboardResult.htmlBase64) {
          const binary = atob(dashboardResult.htmlBase64);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'text/html' });
          const dashboardUrl = URL.createObjectURL(blob);
          assistantContent = '✅ Dashboard ready. Click the preview below to open the interactive dashboard.';
          dashboardPayload = {
            url: dashboardUrl,
            title: dashboardResult.title || 'Dashboard',
            summary: dashboardResult.summary,
          };
        } else if (dashboardResult.error) {
          assistantContent = `Dashboard creation failed: ${dashboardResult.error}`;
          markModelUnavailable(selectedModel, dashboardResult.error);
        }

        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: assistantContent,
          timestamp: assistantTimestamp,
          animate: interactionModeRef.current === 'read',
          dashboard: dashboardPayload,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (error) {
        console.error('Dashboard session failed:', error);
        markModelUnavailable(
          selectedModel,
          error instanceof Error ? error.message : 'api failure'
        );
        const errorMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'I ran into an error while creating the dashboard. Please try again.',
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

      if (pendingHistoryItem) {
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
      }
      setReadSuggestions(localGame.suggestions);

      if (shouldPersistToolSession && isAuthenticated) {
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
        { ...settings, language: detectedRequestLanguage },
        chatHistory,
        "read",
        {
          profile: userProfile || undefined,
          recentQueries: history.slice(0, 8).map((item) => item.query),
          attachments: attachments, // Pass attachments to the service
        },
        undefined,
        selectedModel
      );
      for (const failedModel of narrativeResponse.failedModels || []) {
        markModelUnavailable(failedModel, 'api failure');
      }
      const responseLanguage = normalizeLanguage(narrativeResponse.languageUsed);
      if (responseLanguage) {
        activeLanguageRef.current = responseLanguage;
        setRecognitionLanguageFor(responseLanguage);
        syncDetectedLanguageAndPersona(responseLanguage, userQuery);
      }
      const resolvedModel = normalizeModel(narrativeResponse.modelUsed);
      if (resolvedModel) {
        setLatestResponseModel(resolvedModel);
        if (settings.aiModel === AIModel.AUTO) {
          setLastAutoModel(resolvedModel);
        }
      }

      const narrationWithGames = appendGameSuggestionBlock(narrativeResponse.narration, userQuery, 'read');
      const { cleanedText, suggestions } = parseResponseMetadata(narrationWithGames);
      const bookSummarySuggestion = buildBookSummarySuggestion(userQuery);
      const baseSuggestions = [bookSummarySuggestion, ...suggestions]
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index)
        .slice(0, 3);
      
      const audioBase64 = '';

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: cleanedText,
        timestamp: new Date(),
        audioBlob: undefined,
        modelUsed: resolvedModel || undefined,
        tokenUsage: narrativeResponse.tokenUsage || undefined,
        animate: interactionModeRef.current === "read",
        referencesHtml: narrativeResponse.referencesHtml,
      };

      setMessages(prev => [...prev, assistantMsg]);

      const updatedHistoryItem: HistoryItem | null = pendingHistoryItem
        ? {
            ...pendingHistoryItem,
            response: cleanedText,
            suggestions: baseSuggestions,
            suggestion: baseSuggestions[0],
            modelUsed: resolvedModel || pendingHistoryItem.modelUsed,
            referencesHtml: narrativeResponse.referencesHtml,
            conversation: [
              ...(pendingHistoryItem.conversation || []),
              { role: 'assistant' as const, content: cleanedText, timestamp: new Date() },
            ],
          }
        : null;
      if (updatedHistoryItem) {
        upsertHistoryItem(updatedHistoryItem);
      }

      if (currentMode === SearchMode.BOOK && shouldSwitchFromBookResponse(cleanedText)) {
        setSearchMode(SearchMode.CASE_STUDY);
      }

      // Save assistant message to database if authenticated
      if (shouldPersistToolSession && isAuthenticated) {
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
        const generatedSuggestions = await generateSuggestions(userQuery, detectedRequestLanguage, chatHistory);
        const fallbackSuggestions = buildSuggestionFallback(userQuery);
        const mergedSuggestions = [bookSummarySuggestion, ...baseSuggestions, ...generatedSuggestions, ...fallbackSuggestions]
          .map((item) => item.trim())
          .filter(Boolean)
          .filter((value, index, list) => list.indexOf(value) === index)
          .slice(0, 3);

        if (mergedSuggestions.length > 0) {
          setReadSuggestions(mergedSuggestions);
          if (updatedHistoryItem) {
            const suggestionHistoryItem: HistoryItem = {
              ...updatedHistoryItem,
              suggestions: mergedSuggestions,
              suggestion: mergedSuggestions[0],
            };
            upsertHistoryItem(suggestionHistoryItem);
          }
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
    if (isServiceLocked) return;
    if (disabledToolIds.includes(tool)) return;

    if (tool === 'text') {
      setSelectedTool(null);
      setSelectedModel('auto');
      setSettings((prev) => ({ ...prev, aiModel: AIModel.AUTO }));
      startNewChatSession(false);
      return;
    }

    // Create a new session with tool heading
    setSelectedTool(tool);
    setSelectedModel('auto');
    setSettings((prev) => ({ ...prev, aiModel: AIModel.AUTO }));
    startNewChatSession(false);
    
    // Add tool context heading
    const toolHeadings: Record<string, string> = {
      image: "🎨 Image Creation Session",
      video: "🎬 Video Creation Session",
      ocr: "📄 OCR Session",
      document: "📝 Document Generation Session",
      dashboard: "📊 Dashboard Session",
    };
    
    const heading = toolHeadings[tool] || `${tool} Session`;
    const dashboardAssistText = `**${heading}**

Ready to assist with dashboard creation.

  Query presets you can use directly:
  - Sales per region with region filter and total sales KPI
  - Revenue vs cost by product category with variance KPI and top 15 rows
  - Month-over-month growth by channel with line chart and trend summary
  - Compare attached files by source and show contribution share (%)
  - Customer segment performance with median, average, and distribution

  Customizations supported in plain language:
  - Math: sum, average, median, variance, range, growth/change, comparison
  - Visuals: bar/line/pie chart, table on/off, top N, sorting, grouping, filters
  - Style: dark, light, minimal, executive (ask in query)
  - Scale: large datasets, multiple attachments, cross-file comparison, aggregated KPIs`;

    const toolMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: tool === 'dashboard'
        ? dashboardAssistText
        : `**${heading}**\n\nReady to assist with ${tool}. What would you like to do?`,
      timestamp: new Date(),
      animate: false,
    };
    setMessages([toolMsg]);
  };

  useEffect(() => {
    if (selectedTool && disabledToolIds.includes(selectedTool)) {
      setSelectedTool(null);
    }
  }, [disabledToolIds, selectedTool]);

  useEffect(() => {
    if (interactionMode === 'listen' && disabledToolIds.includes('listen')) {
      setInteractionMode('read');
      setMicMuted(true);
      stopRecognition();
      stopMicAnalyser();
      setListenStatus('idle');
      return;
    }

    if (interactionMode === 'read' && disabledToolIds.includes('read') && !disabledToolIds.includes('listen')) {
      setInteractionMode('listen');
      setMicMuted(false);
    }
  }, [disabledToolIds, interactionMode]);

  const mapSelectedModelToProvider = (model: string): AIModel => {
    if (model === 'auto') return AIModel.AUTO;
    if (model === 'ocr-extended-response') return AIModel.AUTO;
    if (model.startsWith('gpt-')) return AIModel.OPENAI;
    if (model.startsWith('claude-')) return AIModel.CLAUDE_SONNET;
    if (model.startsWith('gemini-') || model.startsWith('imagen-') || model.startsWith('veo-')) return AIModel.GEMINI;
    if (model.startsWith('grok-')) return AIModel.XAI;
    return AIModel.AUTO;
  };

  const shouldDisableModelFromError = (errorText?: string) => {
    if (!errorText) return false;
    return /(insufficient|quota|rate\s*limit|429|billing|api\s*key|unauthorized|forbidden|service unavailable|timeout|timed out|502|503|504|api failure|api error)/i.test(errorText);
  };

  const normalizeModelId = (value: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    const aliases: Record<string, string> = {
      'gemini-1.5-flash': 'gemini-flash',
      'gemini-2.5-flash': 'gemini-flash',
      'gemini-flash': 'gemini-flash',
      'gemini-1.5-pro': 'gemini-pro',
      'gemini-pro': 'gemini-pro',
      'gpt-4-turbo': 'gpt-4',
      'gpt-4': 'gpt-4',
      'gpt-3.5-turbo': 'gpt-3.5',
      'gpt-3.5': 'gpt-3.5',
      'claude-3-sonnet': 'claude-sonnet',
      'claude-sonnet': 'claude-sonnet',
      'claude-3-opus': 'claude-opus',
      'claude-opus': 'claude-opus',
      'claude-3-haiku': 'claude-haiku',
      'claude-haiku': 'claude-haiku',
      'grok-1': 'grok-3',
      'grok-3': 'grok-3',
    };
    return aliases[normalized] || normalized;
  };

  const isModelAdminEnabledForCurrentTool = useCallback((modelId: string) => {
    const toolKey = String(selectedTool && selectedTool !== 'text' ? selectedTool : 'text').toLowerCase();
    const enabledForTool = Array.isArray(enabledModelsByTool?.[toolKey])
      ? enabledModelsByTool[toolKey]
      : Array.isArray(enabledModelsByTool?.text)
        ? enabledModelsByTool.text
        : [];

    if (!enabledForTool.length) return false;

    const normalizedCandidate = normalizeModelId(modelId);
    return enabledForTool.some((enabledId) => normalizeModelId(enabledId) === normalizedCandidate);
  }, [enabledModelsByTool, selectedTool]);

  const markModelUnavailable = useCallback((modelId: string, errorText?: string) => {
    if (!modelId || modelId === 'auto') return;
    if (!shouldDisableModelFromError(errorText)) return;
    setDisabledModelIds((prev) => (prev.includes(modelId) ? prev : [...prev, modelId]));
  }, []);

  const handleModelChange = (model: string) => {
    const isDisabled = disabledModelIds.some((id) => normalizeModelId(id) === normalizeModelId(model));
    if (isDisabled && !isModelAdminEnabledForCurrentTool(model)) return;
    setSelectedModel(model);
    setSettings((prev) => ({
      ...prev,
      aiModel: mapSelectedModelToProvider(model),
    }));
  };

  useEffect(() => {
    const isDisabled = disabledModelIds.some((id) => normalizeModelId(id) === normalizeModelId(selectedModel));
    if (selectedModel !== 'auto' && isDisabled && !isModelAdminEnabledForCurrentTool(selectedModel)) {
      setSelectedModel('auto');
      setSettings((prev) => ({ ...prev, aiModel: AIModel.AUTO }));
    }
  }, [disabledModelIds, isModelAdminEnabledForCurrentTool, selectedModel]);

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

  const openDashboardDialog = (message: ChatMessage) => {
    if (!message.dashboard?.url) return;
    setDashboardDialog({
      open: true,
      url: message.dashboard.url,
      title: message.dashboard.title || 'AI Dashboard',
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

    const abortController = new AbortController();
    mediaRegenAbortRef.current = abortController;
    setIsMediaRegenerating(true);
    try {
      if (mediaDialog.type === 'image') {
        const imageConfig = JSON.parse(sessionStorage.getItem('imageConfig') || '{}');
        const regenerated = await generateToolImage(mediaDialog.prompt, selectedModel, mediaDialog.url, imageConfig);
        if (abortController.signal.aborted) return; // user cancelled
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
        } else if (regenerated.error) {
          markModelUnavailable(selectedModel, regenerated.error);
        }
      } else {
        const videoConfig = JSON.parse(sessionStorage.getItem('videoConfig') || '{}');
        const videoModel = selectedModel === 'auto' ? 'veo-2.0-generate-001' : selectedModel;
        const regenerated = await generateToolVideo(mediaDialog.prompt, videoModel, videoConfig);
        if (abortController.signal.aborted) return; // user cancelled
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
        } else if (regenerated.error) {
          markModelUnavailable(videoModel, regenerated.error);
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        console.error('Regenerate failed:', error);
        markModelUnavailable(
          mediaDialog.type === 'video'
            ? (selectedModel === 'auto' ? 'veo-2.0-generate-001' : selectedModel)
            : selectedModel,
          error instanceof Error ? error.message : 'api failure'
        );
      }
    } finally {
      mediaRegenAbortRef.current = null;
      setIsMediaRegenerating(false);
    }
  };

  const handleMediaRegenCancel = () => {
    // Abort the in-flight regeneration
    if (mediaRegenAbortRef.current) {
      mediaRegenAbortRef.current.abort();
      mediaRegenAbortRef.current = null;
    }
    setIsMediaRegenerating(false);
    // Close dialog – the existing image remains in chat
    setMediaDialog(null);
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
    const selectedLabels: Record<string, string> = {
      auto: 'Auto',
      'ocr-extended-response': 'Extended Response',
      'gpt-4': 'GPT-4 Turbo',
      'gpt-3.5': 'GPT-3.5 Turbo',
      'claude-opus': 'Claude 3 Opus',
      'claude-sonnet': 'Claude 3 Sonnet',
      'claude-haiku': 'Claude 3 Haiku',
      'gemini-pro': 'Gemini 1.5 Pro',
      'gemini-flash': 'Gemini 1.5 Flash',
      'grok-1': 'Grok-1',
      'gemini-2.5-flash-image': 'Gemini 2.5 Flash Image',
      'imagen-4.0-generate-001': 'Imagen 4.0 Generate',
      'grok-imagine-image': 'Grok Imagine Image',
      'grok-imagine-image-pro': 'Grok Imagine Image Pro',
      'veo-3.1-generate-preview': 'Veo 3.1',
      'veo-2.0-generate-001': 'Veo 2.0',
      'grok-imagine-video': 'Grok Imagine Video',
    };

    if (selectedModel !== 'auto') {
      return selectedLabels[selectedModel] || selectedModel;
    }

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

  const normalizeLanguage = (value?: string): Language | null => {
    if (!value) return null;
    const matched = Object.values(Language).find(
      (language) => language.toLowerCase() === value.toLowerCase()
    );
    return matched || null;
  };

  async function handleListenTranscript(transcript: string) {
    if (!transcript.trim() || isLoading) return;

    initAudio();
    const selectedNarrationTypeAtRequest = resolveNarrationType(settings.narrationType);
    if (selectedNarrationTypeAtRequest !== 'Realistic') {
      listenRealisticFollowUpRef.current = null;
    }
    const pendingRealisticFollowUp = listenRealisticFollowUpRef.current;
    const inferredLanguage = inferLanguageFromTranscript(transcript);
    const effectiveLanguage = inferredLanguage || activeLanguageRef.current || Language.ENGLISH;
    activeLanguageRef.current = effectiveLanguage;
    setRecognitionLanguageFor(effectiveLanguage);
    syncDetectedLanguageAndPersona(effectiveLanguage, transcript);
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

      const shouldUseRealisticInteractiveFlow = selectedNarrationTypeAtRequest === 'Realistic';
      const shouldAskClarifyingQuestion = shouldUseRealisticInteractiveFlow && !pendingRealisticFollowUp;
      const resolvedQuery = shouldAskClarifyingQuestion
        ? `You are in voice listen mode with realistic narration style.
User request: "${transcript}"

Ask exactly ONE concise clarifying question before giving any solution.
Rules:
- Output only the question sentence.
- Do not provide analysis, options, or solution yet.
- End with a question mark.`
        : shouldUseRealisticInteractiveFlow && pendingRealisticFollowUp
          ? `Original user request: "${pendingRealisticFollowUp.baseQuery}"
Assistant clarifying question: "${pendingRealisticFollowUp.clarifyingQuestion}"
User clarification: "${transcript}"

Now provide the complete realistic solution.
Rules:
- Do not ask another clarifying question.
- Give direct, practical guidance based on the combined context.`
          : transcript;

      const narrativeResponse = await generateNarrative(
        resolvedQuery,
        currentMode,
        { ...settings, language: effectiveLanguage },
        existingConversation.slice(-6).map((entry) => ({ role: entry.role, content: entry.content })),
        "listen",
        {
          profile: userProfile || undefined,
          recentQueries: history.slice(0, 8).map((item) => item.query),
        },
        continuation,
        selectedModel
      );

      for (const failedModel of narrativeResponse.failedModels || []) {
        markModelUnavailable(failedModel, 'api failure');
      }

      const responseLanguage = normalizeLanguage(narrativeResponse.languageUsed);
      if (responseLanguage) {
        activeLanguageRef.current = responseLanguage;
        setRecognitionLanguageFor(responseLanguage);
        syncDetectedLanguageAndPersona(responseLanguage, transcript);
      }

      const resolvedModel = normalizeModel(narrativeResponse.modelUsed);
      if (resolvedModel) {
        setLatestResponseModel(resolvedModel);
        if (settings.aiModel === AIModel.AUTO) {
          setLastAutoModel(resolvedModel);
        }
      }

      const narrationWithGames = shouldAskClarifyingQuestion
        ? narrativeResponse.narration
        : appendGameSuggestionBlock(narrativeResponse.narration, transcript, 'listen');
      const { cleanedText, voiceProfile } = parseResponseMetadata(narrationWithGames);
      const genre = voiceProfile.genre;
      lastNarrationRef.current = cleanedText;

      const baseQueryForBookSuggestion = pendingRealisticFollowUp?.baseQuery || transcript;
      const listenBookSuggestion = buildBookSummarySuggestion(baseQueryForBookSuggestion);
      const listenSuggestions = shouldAskClarifyingQuestion
        ? (existingItem?.suggestions || [])
        : [listenBookSuggestion]
            .map((item) => item.trim())
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index)
            .slice(0, 3);

      if (shouldAskClarifyingQuestion) {
        listenRealisticFollowUpRef.current = {
          baseQuery: transcript,
          clarifyingQuestion: cleanedText,
        };
      } else if (shouldUseRealisticInteractiveFlow && pendingRealisticFollowUp) {
        listenRealisticFollowUpRef.current = null;
      }

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
        suggestions: listenSuggestions,
        suggestion: listenSuggestions[0],
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

  const getLatestSuggestionAttachments = (): AttachedFile[] => {
    const latestUserWithAttachments = [...messages]
      .reverse()
      .find((msg) => msg.role === 'user' && Array.isArray(msg.attachments) && msg.attachments.length > 0);

    if (!latestUserWithAttachments?.attachments?.length) return [];

    const resolvedTool: AttachedFile['tool'] =
      selectedTool === 'image' || selectedTool === 'video' || selectedTool === 'ocr' || selectedTool === 'document' || selectedTool === 'dashboard'
        ? selectedTool
        : 'dashboard';

    return latestUserWithAttachments.attachments
      .filter((file) => Boolean(file?.name && file?.data))
      .map((file, index) => ({
        id: `pill-${Date.now()}-${index}`,
        name: file.name,
        size: file.size || 0,
        type: file.type || 'application/octet-stream',
        base64: file.data,
        tool: resolvedTool,
      }));
  };

  const handleReadSuggestionClick = (suggestion: string) => {
    if (selectedTool === 'document') {
      setInputValue(suggestion);
      return;
    }

    setInputValue(suggestion);
    const attachments = getLatestSuggestionAttachments();
    void submitQuery(suggestion, attachments);
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
            <span className="text-2xl font-bold text-[var(--background)]">C</span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-4">
            Welcome to ChronicleX <span className="brand-ai-glow">AI</span>
          </h1>
          <p className="text-[var(--muted)] mb-8 text-lg">ChronicleX AI companion app.</p>
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
    <div className="flex h-screen w-full max-w-[100vw] min-w-0 bg-[var(--background)] text-[var(--foreground)] font-sans overflow-hidden">
      {/* Sidebar - History */}
      <aside className="w-64 border-r border-[var(--border)] hidden md:flex md:flex-col">
        <Link
          href="/"
          onClick={stopNarrationForUiChange}
          className="p-6 border-b border-[var(--border)] flex items-center gap-3 hover:bg-[var(--surface-strong)] transition-colors"
        >
          {/* <div className="shrink-0 flex items-center justify-center">
            <Image src="/eyes-logo.svg" alt="ChronicleX AI eyes logo" width={34} height={20} priority />
          </div> */}
          <span className="font-bold tracking-tight text-lg">ChronicleX <span className="brand-ai-glow">AI</span></span>
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
                        {getHistoryBadgeLabel(item)}
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
      <main className="flex-1 min-w-0 flex flex-col relative bg-[var(--background)] overflow-x-hidden">
        {/* Header (Mobile) */}
        <header className="md:hidden fixed top-0 inset-x-0 z-[200] border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur pt-[env(safe-area-inset-top)]">
          <div className="px-4 py-3 flex justify-between items-center">
            <span className="font-bold">ChronicleX <span className="brand-ai-glow">AI</span></span>
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
          </div>
        </header>

        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-[300] bg-[var(--background)]">
            <div className="h-[100dvh] w-full bg-[var(--background)] shadow-xl flex flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
              <div className="shrink-0 p-4 border-b border-[var(--border)] flex items-center justify-between">
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

              <div className="flex-1 min-h-0 overflow-y-auto p-4">
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

                <div className="space-y-1">
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
                              {getHistoryBadgeLabel(item)}
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

              <div className="shrink-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-[var(--border)] flex flex-col gap-2">
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden pl-3 pr-3 sm:pl-4 sm:pr-4 md:px-0 scroll-smooth pb-28 md:pb-10 pt-[calc(env(safe-area-inset-top)+4.25rem)] md:pt-0" ref={readScrollContainerRef}>
            <div className="max-w-3xl mx-auto py-8 md:py-10 space-y-6 px-0">
              {messages.length === 0 && (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                  <div className="flex items-center justify-center gap-3 sm:gap-5">
                    <ThemeSphere />
                    <ThemeSphere />
                  </div>
                </div>
              )}

              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isLatestMessage = index === messages.length - 1;
                const displayContent = isUser ? msg.content : getAssistantDisplayContent(msg);
                const isDashboardAssistantMessage = msg.role === 'assistant' && (
                  !!msg.dashboard ||
                  isDashboardSessionSuggestionMessage(msg) ||
                  (selectedTool === 'dashboard' && isLatestMessage)
                );
                const showCopyButton = !isDashboardAssistantMessage;
                return (
                  <div
                    key={msg.id}
                    ref={isUser ? (node) => registerUserMessageNode(msg.id, node) : undefined}
                    data-message-id={isUser ? msg.id : undefined}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`min-w-0 max-w-[92%] md:max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
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
                          <div
                            ref={(node) => registerAssistantContentNode(msg.id, node)}
                            className="chat-response-content prose prose-sm max-w-full dark:prose-invert min-w-0 overflow-x-auto [overflow-wrap:anywhere]"
                          >
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
                            {msg.dashboard?.url && (
                              <button
                                type="button"
                                onClick={() => openDashboardDialog(msg)}
                                className="mb-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-left"
                              >
                                <div className="relative w-full h-52 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--background)]">
                                  <iframe
                                    src={msg.dashboard.url}
                                    title={msg.dashboard.title || 'Dashboard preview'}
                                    className="w-full h-full border-0 pointer-events-none"
                                    loading="lazy"
                                    sandbox="allow-scripts allow-same-origin"
                                  />
                                  <div className="absolute inset-0 bg-black/15" />
                                  <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] uppercase tracking-widest text-white">
                                    Click to open dashboard
                                  </div>
                                </div>
                                <p className="mt-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">
                                  {msg.dashboard.summary || 'Interactive responsive dashboard preview'}
                                </p>
                              </button>
                            )}
                            {msg.document?.url && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleOpenDocument(msg.document?.url || '');
                                }}
                                className="mb-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-lg border border-[var(--border)] bg-[var(--background)] flex items-center justify-center text-[var(--muted-strong)]">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                      <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs sm:text-sm font-semibold text-[var(--foreground)] whitespace-normal break-words leading-snug">
                                      {msg.document.fileName || 'Generated document'}
                                    </p>
                                    <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
                                      Tap to open document
                                    </p>
                                  </div>
                                </div>
                                {msg.document.summary && (
                                  <p className="mt-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">
                                    {msg.document.summary}
                                  </p>
                                )}
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOpenDocument(msg.document?.url || '');
                                    }}
                                    className="px-2 py-1 rounded border border-[var(--border)] text-[10px] uppercase tracking-widest hover:text-[var(--foreground)] hover:border-[var(--muted-strong)] transition-colors"
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleShareDocument(
                                        msg.document?.url || '',
                                        msg.document?.fileName,
                                        msg.document?.mimeType,
                                      );
                                    }}
                                    className="px-2 py-1 rounded border border-[var(--border)] text-[10px] uppercase tracking-widest hover:text-[var(--foreground)] hover:border-[var(--muted-strong)] transition-colors"
                                  >
                                    Share
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleCopyDocumentLink(msg.id, msg.document?.url || '');
                                    }}
                                    className="px-2 py-1 rounded border border-[var(--border)] text-[10px] tracking-widest hover:text-[var(--foreground)] hover:border-[var(--muted-strong)] transition-colors"
                                  >
                                    {copiedMessageId === `${msg.id}-doc-link` ? 'Copied' : 'Copy Link'}
                                  </button>
                                </div>
                              </button>
                            )}
                            {sanitizeNarrationForDisplay(displayContent).trim() && (
                              <RichMarkdown
                                content={sanitizeNarrationForDisplay(displayContent)}
                                enableTabs
                                enableSlider
                              />
                            )}
                          </div>
                        ) : (
                          displayContent
                        )}
                    </div>
                    {msg.role === 'assistant' && (
                      <>
                        <div className="text-[10px] text-[var(--muted)] px-2 flex items-center gap-3 uppercase tracking-tighter mt-2">
                          {showCopyButton && (
                            <button
                              onClick={() => {
                                void handleCopyMessage(msg.id, msg.content);
                              }}
                              className="px-1.5 py-0.5 rounded border border-[var(--border)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)] transition-colors normal-case"
                              title="Copy full response"
                            >
                              {copiedMessageId === msg.id ? 'Copied' : 'Copy'}
                            </button>
                          )}
                          <span>ChronicleX <span className="brand-ai-glow">AI</span></span>
                          {msg.tokenUsage && (
                            <>
                              <span>•</span>
                              <span title={`Prompt: ${msg.tokenUsage.promptTokens} | Completion: ${msg.tokenUsage.completionTokens} | Cost: ~$${msg.tokenUsage.estimatedCost?.toFixed(4) ?? '?'}`}>
                                {msg.tokenUsage.totalTokens.toLocaleString()} tokens
                              </span>
                            </>
                          )}
                          {msg.modelUsed && (
                            <>
                              <span>•</span>
                              <span>{getModelLabel(msg.modelUsed)}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {msg.referencesHtml && (
                          <div className="mt-3 px-2">
                            <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">References</p>
                            <div
                              className="chat-response-content prose prose-sm max-w-full dark:prose-invert min-w-0 overflow-x-auto [overflow-wrap:anywhere]"
                              dangerouslySetInnerHTML={{ __html: msg.referencesHtml }}
                            />
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
                  {selectedTool === 'image' || selectedTool === 'video' || selectedTool === 'dashboard' || selectedTool === 'ocr' ? (
                    <div className="flex flex-col items-start gap-2">
                      <div className="media-loader-square">
                        <div className="media-loader-grid" />
                        <div className="media-loader-scan" />
                      </div>
                      {selectedTool === 'ocr' && (
                        <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] px-1">
                          Scanning document...
                        </div>
                      )}
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
              {!isLoading && readSuggestions.length > 0 && userMessages.length < 10 && selectedTool !== 'dashboard' && (
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
          <div className="flex-1 px-4 md:px-0 relative pt-[calc(env(safe-area-inset-top)+4.25rem)] md:pt-0">
            {/* TTS Provider Toggle - top of listen mode */}
            <div className="absolute top-4 left-0 right-0 flex justify-center z-10">
              <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-full px-1 py-1">
                {([
                  { key: TextToSpeechProvider.GEMINI, label: 'Auto' },
                  { key: TextToSpeechProvider.GOOGLE, label: 'Google' },
                  { key: TextToSpeechProvider.ELEVENLABS, label: 'ElevenLabs' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, ttsProvider: key }))}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      settings.ttsProvider === key
                        ? 'bg-[var(--foreground)] text-[var(--background)]'
                        : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

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
                </div>
              </div>
              {/* Bottom controls */}
              <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10">
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
                      onClick={() => startNewChatSession()}
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
          <div className={`fixed md:sticky bottom-0 left-0 right-0 md:left-auto md:right-auto z-[120] overflow-visible border-t border-[var(--border)] bg-[var(--background)]/90 backdrop-blur p-2 md:p-8 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:pb-8 transition-all ${userMessages.length >= 10 ? 'pb-64 md:pb-44' : ''}`}>
            <div className="max-w-3xl mx-auto w-full">
              <div className="relative md:relative w-full z-[120] bg-[var(--background)] md:p-0 overflow-visible">
                {/* New Chat Button + SearchBar */}
                <div className="flex min-w-0 gap-2 items-start w-full">
                  <div className="flex-1 min-w-0">
                    <SearchBar 
                      disabled={userMessages.length >= 10 || isServiceLocked}
                      placeholder={isServiceLocked
                        ? "Your account is locked by super admin"
                        : userMessages.length >= 10
                          ? "Limit reached - start new chat"
                          : selectedTool === 'ocr'
                            ? "Explain with example, diagram, chart, table..."
                            : selectedTool === 'dashboard'
                              ? "Create dashboard..."
                              : selectedTool === 'image'
                                ? "Create image..."
                                : "Ask a story, case, or question..."}
                      onNewTopic={messages.length > 0 ? startNewChatSession : undefined}
                      selectedTool={selectedTool}
                      selectedModel={selectedModel}
                      disabledModelIds={disabledModelIds}
                      disabledToolIds={disabledToolIds}
                      enabledModelsByTool={enabledModelsByTool}
                      currentMode={selectedTool || 'text'}
                      preferredTextProvider={settings.aiModel}
                      isNewChat={messages.length === 0}
                      isListening={isListening}
                      prefillQuery={inputValue}
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
              {isServiceLocked && (
                <p className="mt-2 text-[11px] text-center text-red-400 uppercase tracking-wider">
                  Access locked by super admin
                </p>
              )}
              {sessionResponsePolicy?.limit !== null && !isServiceLocked && (
                <p className="mt-1 text-[10px] text-center text-[var(--muted)] uppercase tracking-wider">
                  Session responses: {sessionResponsePolicy?.used ?? 0}/{sessionResponsePolicy?.limit ?? 0}
                </p>
              )}
              <p className="text-[10px] text-center text-[var(--muted)] mt-3 uppercase tracking-widest">
                Processing in {settings.language} Language
              </p>
            </div>
          </div>
        )}
      </main>

      {selectedHistory && selectedHistory.interactionMode === "listen" && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[var(--surface)] border border-[var(--border)] w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
            <div className="p-4 sm:p-6 border-b border-[var(--border)] flex justify-between items-center flex-wrap gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold">Listen Session</h2>
                <p className="text-xs text-[var(--muted)] uppercase tracking-widest mt-1 line-clamp-1">{selectedHistory.query}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
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
                              <div
                                className="chat-response-content prose prose-sm max-w-full dark:prose-invert min-w-0 overflow-x-auto [overflow-wrap:anywhere]"
                                dangerouslySetInnerHTML={{ __html: selectedHistory.referencesHtml }}
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="whitespace-pre-line text-xs sm:text-sm">{entry.content}</span>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>

              {!!selectedHistory.suggestions?.length && (
                <div className="pt-2 border-t border-[var(--border)]">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">Suggested book to summarize</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedHistory.suggestions.slice(0, 3).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          stopNarration();
                          setSelectedHistory(null);
                          setInteractionMode('listen');
                          void handleListenTranscriptRef.current(suggestion);
                        }}
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
          onCancel={handleMediaRegenCancel}
          isBusy={isMediaRegenerating}
        />
      )}

      {dashboardDialog && (
        <DashboardDialog
          open={dashboardDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setDashboardDialog(null);
              return;
            }
            setDashboardDialog((prev) => (prev ? { ...prev, open } : prev));
          }}
          dashboardUrl={dashboardDialog.url}
          title={dashboardDialog.title}
        />
      )}

    </div>
  );
}
