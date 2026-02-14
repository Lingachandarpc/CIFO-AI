"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { SearchMode, Settings, ChatMessage, HistoryItem, VoiceName, Language, TextToSpeechProvider, Genre, VoiceGender, AIModel, VoiceProfile } from './types';
import { BookIcon, CaseStudyIcon, SettingsIcon, HistoryIcon, PlayIcon, MicIcon, StopIcon } from '../components/Icons';
import ThemeToggle from '../components/ThemeToggle';
import { generateNarrative, generateSpeech, decodeAudio, getAudioBuffer } from './services/openaiService';
import { generateSpeechWithElevenLabs, getVoicesForLanguageAndGender } from './services/elevenLabsService';
import { createAmbientMusicForGenre, stopAmbientMusic as stopMusicService } from './services/backgroundMusicService';
import ReactMarkdown from 'react-markdown';

export default function HomeView() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>(SearchMode.CASE_STUDY);
  const [interactionMode, setInteractionMode] = useState<"read" | "listen">("read");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listenStatus, setListenStatus] = useState<"idle" | "listening" | "thinking" | "narrating" | "completed">("idle");
  const [pulse, setPulse] = useState(0);
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [readSuggestions, setReadSuggestions] = useState<string[]>([]);
  const [activeNarrationKey, setActiveNarrationKey] = useState<string | null>(null);
  const { status } = useSession();
  const [authCheckAuthenticated, setAuthCheckAuthenticated] = useState(false);
  const isSessionAuthenticated = status === 'authenticated';
  const isAuthenticated = isSessionAuthenticated || authCheckAuthenticated;
  const [userId, setUserId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>({
    narrationTime: 5,
    narrationType: 'Realistic',
    voiceType: VoiceName.ZEPHYR,
    voiceGender: VoiceGender.AUTO,
    language: Language.ENGLISH,
    ttsProvider: TextToSpeechProvider.ELEVENLABS,
    aiModel: AIModel.AUTO,
    enableBackgroundMusic: true,
    backgroundMusicVolume: 0.15,
  });
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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const settingsSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  const handleListenTranscriptRef = useRef<(transcript: string) => void>(() => {});

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
        if (interactionModeRef.current === "listen" && !isMicMutedRef.current) {
          startRecognition(true);
          return;
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
            setSettings((prev) => ({
              ...prev,
              aiModel:
                settingsData.settings.aiModel === AIModel.OPENAI ||
                settingsData.settings.aiModel === AIModel.CLAUDE_SONNET ||
                settingsData.settings.aiModel === AIModel.XAI ||
                settingsData.settings.aiModel === AIModel.AUTO
                  ? settingsData.settings.aiModel
                  : AIModel.AUTO,
              narrationTime: settingsData.settings.narrationTime || 5,
              narrationType: settingsData.settings.narrationType || 'Realistic',
              voiceType: settingsData.settings.voiceType || VoiceName.ZEPHYR,
              voiceGender: settingsData.settings.voiceGender || VoiceGender.AUTO,
              language: settingsData.settings.language || Language.ENGLISH,
              ttsProvider: settingsData.settings.ttsProvider || TextToSpeechProvider.ELEVENLABS,
              enableBackgroundMusic: settingsData.settings.enableBackgroundMusic !== undefined ? settingsData.settings.enableBackgroundMusic : true,
              backgroundMusicVolume: settingsData.settings.backgroundMusicVolume || 0.15,
            }));
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
    const availableVoices = getVoicesForLanguageAndGender(settings.language, settings.voiceGender);
    if (availableVoices.length === 0) return;
    if (!availableVoices.includes(settings.voiceType)) {
      setSettings((prev) => ({
        ...prev,
        voiceType: availableVoices[0],
      }));
    }
  }, [settings.language, settings.voiceGender, settings.voiceType]);

  useEffect(() => {
    setRecognitionLanguage();
    if (interactionModeRef.current === "listen") {
      stopRecognition();
      startRecognition(true);
    }
  }, [settings.language]);

  const setRecognitionLanguage = () => {
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
    if (recognitionRef.current) recognitionRef.current.lang = langMap[settings.language] || 'en-US';
  };

  const toggleMic = () => {
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

  const getTtsExcerpt = (text: string, mode: "read" | "listen") => {
    const wordsPerMinute = mode === "listen" ? 150 : 130;
    const maxWords = Math.max(120, settings.narrationTime * wordsPerMinute);
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(' ');
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
    const buildPayload = (options: { maxItems: number; maxResponseChars: number; includeConversation: boolean }) => {
      return items.slice(0, options.maxItems).map((item) => {
        const isListen = item.interactionMode === "listen";
        const conversation = options.includeConversation
          ? item.conversation?.slice(-8)
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
      { maxItems: 20, maxResponseChars: 6000, includeConversation: true },
      { maxItems: 12, maxResponseChars: 4000, includeConversation: false },
      { maxItems: 6, maxResponseChars: 2000, includeConversation: false },
    ];

    for (const attempt of attempts) {
      try {
        localStorage.setItem(getHistoryStorageKey(userId), JSON.stringify(buildPayload(attempt)));
        return;
      } catch {}
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const tick = () => {
      const micLevel = getAnalyserLevel(micAnalyserRef.current);
      const narrationLevel = getAnalyserLevel(narrationAnalyserRef.current);
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
    options?: { listenMode?: boolean; genre?: string | null }
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
        if (!hasStartedNarration && options?.listenMode) {
          hasStartedNarration = true;
          setListenStatus('narrating');
          startAmbientMusic(options.genre || null);
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
      if (options?.listenMode) {
        setListenStatus(isMicMutedRef.current ? 'idle' : 'listening');
      }
    }

    return 'completed';
  };

  /**
   * Generate speech using the configured TTS provider (OpenAI or ElevenLabs)
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
    if (provider === TextToSpeechProvider.ELEVENLABS) {
      return [TextToSpeechProvider.ELEVENLABS, TextToSpeechProvider.OPENAI];
    }
    if (provider === TextToSpeechProvider.OPENAI) {
      return [TextToSpeechProvider.OPENAI, TextToSpeechProvider.ELEVENLABS];
    }
    return [];
  };

  const generateNarrationAudio = async (text: string, voiceProfile?: VoiceProfile): Promise<string> => {
    const effectiveNarrationType = toVoiceNarrationType(voiceProfile, settings.narrationType);
    const providerOrder = getTtsProviderOrder(settings.ttsProvider);

    for (const provider of providerOrder) {
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

  const playBrowserTTS = (text: string, options?: { listenMode?: boolean; genre?: string | null; onComplete?: () => void }) => {
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
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
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

  const stopNarrationForUiChange = () => {
    if (isNarratingRef.current) {
      handleStopNarration();
    }
  };

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
        .replace(/^[-•\d\.)\s]+/, '')
        .replace(/[\*_`~]/g, '')
        .trim();
      if (!normalized) return;

      const pipeSplit = normalized.split('|').map((item) => item.trim()).filter(Boolean);
      const hyphenSplit = pipeSplit.length === 1
        ? normalized.split(/\s-\s+/).map((item) => item.trim()).filter(Boolean)
        : [];
      const values = (pipeSplit.length > 1 ? pipeSplit : hyphenSplit.length > 1 ? hyphenSplit : [normalized]).slice(0, 6);
      values.forEach((value) => {
        if (!suggestions.includes(value)) suggestions.push(value);
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

  const submitQuery = async (query: string) => {
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
    setIsLoading(true);

    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userQuery,
      timestamp: requestTimestamp,
      mode: currentMode,
    };

    setMessages(prev => [...prev, newUserMsg]);
    setSelectedHistoryId(historyId);
    setSelectedHistory(null);

    const existingItem = history.find((entry) => entry.id === historyId);
    const existingConversation: Array<Pick<ChatMessage, 'role' | 'content' | 'timestamp'>> = existingItem?.conversation?.map((entry) => ({
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

    try {
      const chatHistory = [...messages.slice(-5), newUserMsg].map(m => ({ role: m.role, content: m.content }));
      const narrativeResponse = await generateNarrative(
        userQuery,
        currentMode,
        settings,
        chatHistory,
        "read",
        {
          profile: userProfile || undefined,
          recentQueries: history.slice(0, 8).map((item) => item.query),
        }
      );
      const resolvedModel = normalizeModel(narrativeResponse.modelUsed);
      if (resolvedModel) {
        setLatestResponseModel(resolvedModel);
        if (settings.aiModel === AIModel.AUTO) {
          setLastAutoModel(resolvedModel);
        }
      }

      const { cleanedText, suggestions } = parseResponseMetadata(narrativeResponse.narration);
      
      const audioBase64 = '';

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: cleanedText,
        timestamp: new Date(),
        audioBlob: undefined,
        modelUsed: resolvedModel || undefined,
      };

      setMessages(prev => [...prev, assistantMsg]);

      const updatedHistoryItem: HistoryItem = {
        ...pendingHistoryItem,
        response: cleanedText,
        suggestions,
        suggestion: suggestions[0],
        modelUsed: resolvedModel || pendingHistoryItem.modelUsed,
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

      setReadSuggestions(suggestions);

    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I encountered an error while processing your narrative request.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await submitQuery(inputValue);
  };

  const getModelLabel = (model: AIModel) => {
    switch (model) {
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
    if (normalized === AIModel.XAI) return AIModel.XAI;
    return null;
  };

  async function handleListenTranscript(transcript: string) {
    if (!transcript.trim() || isLoading) return;

    initAudio();
    const resolvedMode = resolveSearchMode(transcript, searchMode);
    if (resolvedMode !== searchMode) {
      setSearchMode(resolvedMode);
    }
    const currentMode = resolvedMode;
    const wasNarrating = isNarratingRef.current;
    const requestTimestamp = new Date();
    listenRequestPendingRef.current = true;
    if (!activeListenSessionIdRef.current) {
      lastListenQueryRef.current = transcript;
    }
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
      query: existingItem?.query || transcript,
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
      const continuation = lastNarrationRef.current
        ? {
            previousNarration: lastNarrationRef.current,
            userInterruption: wasNarrating ? transcript : undefined,
          }
        : undefined;

      const narrativeResponse = await generateNarrative(
        transcript,
        currentMode,
        settings,
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

      const { cleanedText, voiceProfile } = parseResponseMetadata(narrativeResponse.narration);
      const genre = voiceProfile.genre;
      lastNarrationRef.current = cleanedText;

      const excerpt = getTtsExcerpt(cleanedText, "listen");
      const startListenNarration = async () => {
        if (settings.ttsProvider === TextToSpeechProvider.OPEN_SOURCE) {
          try {
            playBrowserTTS(excerpt, { listenMode: true, genre: genre || null });
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
            playBrowserTTS(excerpt, { listenMode: true, genre: genre || null });
          } catch (fallbackError) {
            console.error('Browser TTS fallback failed:', fallbackError);
            setMessages(prev => [...prev, {
              id: `tts-error-${Date.now()}`,
              role: 'assistant',
              content: 'Audio narration failed. The text response is shown below.',
              timestamp: new Date(),
              mode: currentMode,
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
        query: existingItem?.query || transcript,
        mode: currentMode,
        interactionMode: "listen",
        timestamp: now,
        response: cleanedText,
        genre,
        modelUsed: resolvedModel || existingItem?.modelUsed,
        voiceProfile,
        conversation: mergedConversation,
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
    const excerpt = getTtsExcerpt(entry.content, "listen");
    if (settings.ttsProvider === TextToSpeechProvider.OPEN_SOURCE) {
      try {
        playBrowserTTS(excerpt, {
          onComplete: () => {
            if (activeNarrationKeyRef.current === entryKey) {
              activeNarrationKeyRef.current = null;
              setActiveNarrationKey(null);
            }
          },
        });
      } catch (fallbackError) {
        console.error('Browser TTS failed:', fallbackError);
      }
      return;
    }

    const playStatus = await playTtsInChunks(excerpt, voiceProfile, { listenMode: false });
    if (playStatus === 'timeout') {
      if (activeNarrationKeyRef.current === entryKey) {
        activeNarrationKeyRef.current = null;
        setActiveNarrationKey(null);
      }
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
          },
        });
      } catch (fallbackError) {
        console.error('Browser TTS fallback failed:', fallbackError);
      }
      return;
    }

    if (activeNarrationKeyRef.current === entryKey) {
      activeNarrationKeyRef.current = null;
      setActiveNarrationKey(null);
    }
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
    }));

    setMessages(mappedMessages);
    setInteractionMode("read");
    setSearchMode(item.mode);
    activeReadSessionIdRef.current = item.id;
    if (item.modelUsed) {
      setLatestResponseModel(item.modelUsed);
    }
    setReadSuggestions(item.suggestions || (item.suggestion ? [item.suggestion] : []));
    setInputValue('');
  };

  useEffect(() => {
    handleListenTranscriptRef.current = handleListenTranscript;
  }, [handleListenTranscript]);

  const getListenConversation = (item: HistoryItem) => {
    if (item.conversation?.length) return item.conversation;
    const fallback: Array<Pick<ChatMessage, 'role' | 'content' | 'timestamp'>> = [
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
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-4 text-[var(--muted)] text-xs font-semibold uppercase tracking-widest">
            <HistoryIcon className="w-4 h-4" />
            <span>Neural History</span>
          </div>
          <div className="space-y-1">
            {history.length === 0 ? (
              <p className="text-[var(--muted)] text-sm italic">No recent explorations</p>
            ) : (
              history.map((item) => (
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

              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex items-center gap-2 mb-4 text-[var(--muted)] text-xs font-semibold uppercase tracking-widest">
                  <HistoryIcon className="w-4 h-4" />
                  <span>Neural History</span>
                </div>
                <div className="space-y-1">
                  {history.length === 0 ? (
                    <p className="text-[var(--muted)] text-sm italic">No recent explorations</p>
                  ) : (
                    history.map((item) => (
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
          <div className="flex-1 overflow-y-auto px-3 md:px-0 scroll-smooth pb-28 md:pb-10">
            <div className="max-w-3xl mx-auto py-8 md:py-10 space-y-8">
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

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[92%] md:max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-3.5 md:p-4 rounded-2xl text-sm md:text-[15px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)]'
                        : 'bg-transparent text-[var(--foreground)] whitespace-pre-line'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown>
                            {sanitizeNarrationForDisplay(msg.content)}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}
                      {msg.audioBlob && (
                        <button 
                          onClick={() => handlePlayAudio(msg.audioBlob!)}
                          className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-[var(--foreground)] text-[var(--background)] rounded-full text-xs font-bold hover:opacity-90 transition-colors"
                        >
                          <PlayIcon className="w-4 h-4" />
                          Listen Narration
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--muted)] px-2 flex items-center gap-2 uppercase tracking-tighter">
                      {msg.role === 'assistant' ? 'Self \\ Fles' : 'You'} 
                      <span>•</span>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.role === 'assistant' && msg.modelUsed && (
                        <>
                          <span>•</span>
                          {getModelLabel(msg.modelUsed)}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-2xl animate-pulse">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce delay-75"></div>
                      <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                </div>
              )}
              {!isLoading && readSuggestions.length > 0 && (
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
              <div ref={chatEndRef} />
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

        {interactionMode === "read" && (
          <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--background)]/90 backdrop-blur p-3 md:p-8">
            <div className="max-w-3xl mx-auto">
              <form onSubmit={handleSubmit} className="relative group">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      stopNarrationForUiChange();
                      setMessages([]);
                      setInputValue('');
                      setReadSuggestions([]);
                      setSelectedHistory(null);
                      setSelectedHistoryId(null);
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
                    title="New topic"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => { setInputValue(e.target.value); stopNarration(); }}
                  placeholder="Ask a story, case, or question..."
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl py-3.5 pl-12 pr-12 focus:outline-none focus:border-[var(--muted-strong)] focus:bg-[var(--surface-strong)] transition-all text-sm md:text-base placeholder-[var(--muted)]"
                />

                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {inputValue.trim() ? (
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="p-2 rounded-xl bg-[var(--foreground)] text-[var(--background)] transition-all"
                      title="Send"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        stopNarrationForUiChange();
                        resetListenSession();
                        setInteractionMode("listen");
                        setIsMicMuted(false);
                      }}
                      className="p-2 rounded-xl bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] transition-all"
                      title="Listen"
                    >
                      <MicIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </form>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[var(--surface)] border border-[var(--border)] w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-[var(--border)] flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Listen Session</h2>
                <p className="text-xs text-[var(--muted)] uppercase tracking-widest mt-1">{selectedHistory.query}</p>
                <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest mt-2">
                  AI Model: {selectedHistory.modelUsed ? getModelLabel(selectedHistory.modelUsed) : getCurrentModelLabel()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isNarrating && (
                  <button
                    type="button"
                    onClick={handleStopNarration}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-strong)]"
                  >
                    <StopIcon className="w-3.5 h-3.5" />
                    Stop
                  </button>
                )}
                <button onClick={closeListenModal} className="text-[var(--muted)] hover:text-[var(--foreground)]">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-3">
                {getListenConversation(selectedHistory).map((entry, index) => {
                  const entryKey = `${selectedHistory.id}-${index}`;
                  const isEntryNarrating = isNarrating && activeNarrationKey === entryKey;
                  return (
                  <div key={`${entry.role}-${index}`} className={`p-3 rounded-xl border ${entry.role === 'user' ? 'border-[var(--border)] bg-[var(--surface-strong)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                    <p className="text-[11px] uppercase tracking-widest text-[var(--muted)] mb-2">{entry.role === 'user' ? 'You' : 'Narrator'}</p>
                    <div className="text-sm text-[var(--foreground)]">
                      {entry.role === 'assistant' ? (
                        <div className="prose prose-xs max-w-none dark:prose-invert">
                          <ReactMarkdown>
                            {sanitizeNarrationForDisplay(entry.content)}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <span className="whitespace-pre-line">{entry.content}</span>
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

    </div>
  );
}
