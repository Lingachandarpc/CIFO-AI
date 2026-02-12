"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { SearchMode, Settings, ChatMessage, HistoryItem, VoiceName, Language, TextToSpeechProvider, Genre, VoiceGender } from './types';
import { BookIcon, CaseStudyIcon, SettingsIcon, HistoryIcon, PlayIcon, MicIcon, StopIcon } from '../components/Icons';
import ThemeToggle from '../components/ThemeToggle';
import { generateNarrative, generateSpeech, decodeAudio, getAudioBuffer, generateSuggestions } from './services/openaiService';
import { generateSpeechWithElevenLabs, getVoicesForLanguageAndGender } from './services/elevenLabsService';
import { createAmbientMusicForGenre, stopAmbientMusic as stopMusicService } from './services/backgroundMusicService';

export default function HomeView() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>(SearchMode.BOOK);
  const [interactionMode, setInteractionMode] = useState<"read" | "listen">("read");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listenStatus, setListenStatus] = useState<"idle" | "listening" | "thinking" | "narrating">("idle");
  const [pulse, setPulse] = useState(0);
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [readSuggestions, setReadSuggestions] = useState<string[]>([]);
  const [listenSuggestions, setListenSuggestions] = useState<string[]>([]);
  const [isLoadingReadSuggestions, setIsLoadingReadSuggestions] = useState(false);
  const [isLoadingListenSuggestions, setIsLoadingListenSuggestions] = useState(false);
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
    enableBackgroundMusic: true,
    backgroundMusicVolume: 0.15,
  });

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
  const lastNarrationRef = useRef<string>('');
  const lastListenQueryRef = useRef<string>('');
  const activeListenSessionIdRef = useRef<string | null>(null);
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
      return items.slice(0, options.maxItems).map((item) => ({
        ...item,
        audioBlob: undefined,
        response: item.response && item.response.length > options.maxResponseChars
          ? item.response.slice(0, options.maxResponseChars)
          : item.response,
        conversation: options.includeConversation ? item.conversation : undefined,
      }));
    };

    const attempts = [
      { maxItems: 20, maxResponseChars: 4000, includeConversation: true },
      { maxItems: 10, maxResponseChars: 2000, includeConversation: false },
      { maxItems: 5, maxResponseChars: 1000, includeConversation: false },
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
        activeListenSessionIdRef.current = null;
      }
    };
  };

  /**
   * Generate speech using the configured TTS provider (OpenAI or ElevenLabs)
   */
  const generateNarrationAudio = async (text: string): Promise<string> => {
    if (settings.ttsProvider === TextToSpeechProvider.ELEVENLABS) {
      const elevenLabsAudio = await generateSpeechWithElevenLabs(
        text,
        settings.voiceType,
        settings.language,
        settings.narrationType,
        settings.voiceGender
      );
      if (elevenLabsAudio) return elevenLabsAudio;
      return (await generateSpeech(text, settings.voiceType)) || '';
    } else {
      return (await generateSpeech(text, settings.voiceType)) || '';
    }
  };

  const narrateHistoryItem = async (item: HistoryItem) => {
    if (!item.response) return;
    const audioBase64 = item.audioBlob || await generateNarrationAudio(getTtsExcerpt(item.response, "listen")) || '';
    if (audioBase64) {
      handlePlayAudio(audioBase64, { listenMode: true, genre: item.genre || null });
      if (!item.audioBlob) {
        upsertHistoryItem({ ...item, audioBlob: audioBase64 });
      }
    }
  };

  const stopNarration = () => {
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
      activeListenSessionIdRef.current = null;
    }
  };

  const extractListenMetadata = (text: string) => {
    const lines = text.split(/\r?\n/).filter(Boolean);
    let genre: string | undefined;
    let cleaned = text;

    const firstLine = lines[0] || '';
    const normalizedFirstLine = firstLine.replace(/[\*_`~]/g, '').trim();
    if (normalizedFirstLine.toLowerCase().startsWith('genre:')) {
      genre = normalizedFirstLine.slice(6).trim();
      cleaned = lines.slice(1).join('\n');
    }

    const suggestionMatch = cleaned.match(/Suggested next:\s*(.+)$/im);
    const suggestion = suggestionMatch?.[1]?.trim();
    return { cleanedText: cleaned.trim(), genre, suggestion };
  };

  const submitQuery = async (query: string) => {
    if (!query.trim() || isLoading) return;

    initAudio();
    const userQuery = query;
    const currentMode = searchMode;
    const historyId = Math.random().toString(36).substr(2, 9);
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

    const pendingHistoryItem: HistoryItem = {
      id: historyId,
      query: userQuery,
      mode: currentMode,
      interactionMode: "read",
      timestamp: requestTimestamp,
      response: undefined,
      audioBlob: undefined,
      conversation: [{ role: 'user', content: userQuery, timestamp: requestTimestamp }],
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
      const narrativeText = await generateNarrative(userQuery, currentMode, settings, chatHistory);
      
      const audioBase64 = '';

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: narrativeText,
        timestamp: new Date(),
        audioBlob: undefined,
      };

      setMessages(prev => [...prev, assistantMsg]);

      const updatedHistoryItem: HistoryItem = {
        ...pendingHistoryItem,
        response: narrativeText,
        conversation: [
          { role: 'user', content: userQuery, timestamp: requestTimestamp },
          { role: 'assistant', content: narrativeText, timestamp: new Date() },
        ],
      };
      upsertHistoryItem(updatedHistoryItem);

      // Save assistant message to database if authenticated
      if (isAuthenticated) {
        fetch('/api/chronoread/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            content: narrativeText,
            mode: currentMode === SearchMode.BOOK ? 'BOOK' : 'CASE_STUDY',
            audioBlob: audioBase64 || null,
          }),
        }).catch((error) => console.error('Error saving assistant message:', error));
      }

      const suggestionHistory = [...messages.slice(-4), newUserMsg, assistantMsg]
        .map((entry) => ({ role: entry.role, content: entry.content }));
      setIsLoadingReadSuggestions(true);
      const suggestions = await generateSuggestions(userQuery, settings.language, suggestionHistory).catch(() => []);
      setReadSuggestions(suggestions);
      setIsLoadingReadSuggestions(false);

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

  async function handleListenTranscript(transcript: string) {
    if (!transcript.trim() || isLoading) return;

    initAudio();
    const currentMode = searchMode;
    const wasNarrating = isNarratingRef.current;
    const requestTimestamp = new Date();
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

    const pendingHistoryItem: HistoryItem = {
      id: historyId,
      query: transcript,
      mode: currentMode,
      interactionMode: "listen",
      timestamp: requestTimestamp,
      response: undefined,
      audioBlob: undefined,
      conversation: [{ role: 'user', content: transcript, timestamp: requestTimestamp }],
    };
    upsertHistoryItem(pendingHistoryItem);
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

      const narrativeText = await generateNarrative(
        transcript,
        currentMode,
        settings,
        [],
        "listen",
        continuation
      );

      const { cleanedText, genre, suggestion } = extractListenMetadata(narrativeText);
      lastNarrationRef.current = cleanedText;

      const audioBase64 = await generateNarrationAudio(getTtsExcerpt(cleanedText, "listen")) || '';
      if (audioBase64) {
        handlePlayAudio(audioBase64, { listenMode: true, genre: genre || null });
      }

      const now = new Date();
      const newConversation = [
        { role: 'user' as const, content: transcript, timestamp: requestTimestamp },
        { role: 'assistant' as const, content: cleanedText, timestamp: new Date() },
      ];

      const existingItem = history.find((entry) => entry.id === historyId);
      const existingConversation: Array<Pick<ChatMessage, 'role' | 'content' | 'timestamp'>> = existingItem?.conversation?.map((entry) => ({
        ...entry,
        role: entry.role as 'user' | 'assistant',
      })) || [];
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
        audioBlob: audioBase64 || undefined,
        genre,
        suggestion,
        conversation: mergedConversation,
      };

      upsertHistoryItem(historyItem);

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
            audioBlob: audioBase64 || null,
          }),
        }).catch((error) => console.error('Error saving listen assistant message:', error));
      }
    } catch (error) {
      console.error(error);
      setListenStatus("listening");
    } finally {
      setIsLoading(false);
      if (interactionModeRef.current === "listen" && !isNarratingRef.current) {
        setListenStatus("listening");
      }
    }
  }

  const handleReadSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    void submitQuery(suggestion);
  };

  const handleListenSuggestionClick = (suggestion: string) => {
    if (selectedHistory) {
      activeListenSessionIdRef.current = selectedHistory.id;
      setSearchMode(selectedHistory.mode);
    }
    lastListenQueryRef.current = suggestion;
    setInteractionMode("listen");
    setSelectedHistory(null);
    setTimeout(() => {
      void handleListenTranscriptRef.current(suggestion);
    }, 0);
  };

  const closeListenModal = () => {
    handleStopNarration();
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
    setInputValue('');
  };

  useEffect(() => {
    handleListenTranscriptRef.current = handleListenTranscript;
  }, [handleListenTranscript]);

  useEffect(() => {
    if (!selectedHistory || selectedHistory.interactionMode !== "listen") {
      setListenSuggestions([]);
      return;
    }

    const historyContext = (selectedHistory.conversation || []).map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));

    setIsLoadingListenSuggestions(true);
    generateSuggestions(selectedHistory.query, settings.language, historyContext)
      .then((suggestions) => setListenSuggestions(suggestions))
      .catch(() => setListenSuggestions([]))
      .finally(() => setIsLoadingListenSuggestions(false));
  }, [selectedHistory, settings.language]);

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
            <span className="text-2xl font-bold text-[var(--background)]">N</span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-4">Welcome to Chronoread</h1>
          <p className="text-[var(--muted)] mb-8 text-lg">
            Explore books and case studies with AI-powered neural narratives
          </p>
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
        <div className="p-6 border-b border-[var(--border)] flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--foreground)] rounded-md flex items-center justify-center">
            <span className="text-[var(--background)] font-bold text-xl">X</span>
          </div>
          <span className="font-bold tracking-tight text-lg">NarrativeX</span>
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
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedHistoryId(item.id);
                    if (item.interactionMode === "listen") {
                      setSelectedHistory(item);
                    } else {
                      setSelectedHistory(null);
                      loadReadHistory(item);
                    }
                  }}
                  className={`w-full text-left p-3 rounded-lg transition-colors text-sm truncate ${
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
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[var(--border)] flex flex-col gap-2">
          <div className="px-3 py-1 flex items-center gap-2 text-[10px] text-[var(--muted)] uppercase tracking-widest">
            <span>{settings.language} Mode</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-strong)] text-[var(--muted-strong)]">
            <ThemeToggle className="h-8 w-8 shadow-none" />
            <span className="text-sm font-semibold">Theme</span>
          </div>
          <Link
            href="/settings"
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
          <span className="font-bold">NarrativeX</span>
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
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedHistoryId(item.id);
                          if (item.interactionMode === "listen") {
                            setSelectedHistory(item);
                          } else {
                            setSelectedHistory(null);
                            loadReadHistory(item);
                          }
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-colors text-sm truncate ${
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
                    ))
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-[var(--border)] flex flex-col gap-2">
                <div className="px-3 py-1 flex items-center gap-2 text-[10px] text-[var(--muted)] uppercase tracking-widest">
                  <span>{settings.language} Mode</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-strong)] text-[var(--muted-strong)]">
                  <ThemeToggle className="h-8 w-8 shadow-none" />
                  <span className="text-sm font-semibold">Theme</span>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setIsMobileMenuOpen(false)}
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

        {/* Mode Toggle */}
        <div className="px-4 md:px-8 py-4 border-b border-[var(--border)]">
          <div className="max-w-3xl mx-auto flex flex-nowrap items-center justify-between gap-2 md:gap-3">
            <div className="inline-flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-full p-1">
              <button
                onClick={() => setInteractionMode("read")}
                className={`px-3 py-1.5 md:px-4 md:py-2 rounded-full text-[9px] md:text-xs font-bold uppercase tracking-widest transition-all ${interactionMode === "read" ? 'bg-[var(--foreground)] text-[var(--background)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
              >
                Read
              </button>
              <button
                onClick={() => setInteractionMode("listen")}
                className={`px-3 py-1.5 md:px-4 md:py-2 rounded-full text-[9px] md:text-xs font-bold uppercase tracking-widest transition-all ${interactionMode === "listen" ? 'bg-[var(--foreground)] text-[var(--background)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
              >
                Listen
              </button>
            </div>

            <div className="inline-flex items-center gap-2">
              <div className="inline-flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-full p-1">
                <button
                  onClick={() => setSearchMode(SearchMode.BOOK)}
                  className={`px-2.5 py-1 md:px-3 md:py-1.5 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all ${searchMode === SearchMode.BOOK ? 'bg-[var(--foreground)] text-[var(--background)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
                >
                  Books
                </button>
                <button
                  onClick={() => setSearchMode(SearchMode.CASE_STUDY)}
                  className={`px-2.5 py-1 md:px-3 md:py-1.5 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all ${searchMode === SearchMode.CASE_STUDY ? 'bg-[var(--foreground)] text-[var(--background)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
                >
                  Case Study
                </button>
              </div>
            </div>
          </div>
        </div>

        {interactionMode === "read" ? (
          <div className="flex-1 overflow-y-auto px-4 md:px-0 scroll-smooth">
            <div className="max-w-3xl mx-auto py-10 space-y-8">
              {messages.length === 0 && (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-16 h-16 bg-[var(--surface)] rounded-2xl flex items-center justify-center border border-[var(--border)]">
                    <span className="text-3xl font-bold">N</span>
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold mb-2">Narrate in {settings.language}</h1>
                    <p className="text-[var(--muted)] max-w-sm mx-auto">Explore books or real-world cases with realistic neural voice interaction.</p>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-4 rounded-2xl text-[15px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)]'
                        : 'bg-transparent text-[var(--foreground)]'
                    }`}>
                      {msg.content}
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
                      {msg.role === 'assistant' ? 'NarrativeX' : 'You'} 
                      <span>•</span>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
              {!isLoading && (isLoadingReadSuggestions || readSuggestions.length > 0) && (
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">Suggested next</p>
                  <div className="flex flex-wrap gap-2">
                    {isLoadingReadSuggestions && readSuggestions.length === 0 && (
                      <span className="text-xs text-[var(--muted)]">Loading suggestions...</span>
                    )}
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
                    {listenStatus === "thinking" ? 'Thinking' : listenStatus === "narrating" ? 'Narrating' : isMicMuted ? 'Muted' : 'Listening'}
                  </p>
                  <p className="text-lg font-semibold text-[var(--foreground)]">{searchMode === SearchMode.BOOK ? 'Book' : 'Case Study'} Mode</p>
                </div>
              </div>
              <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleStopNarration}
                    disabled={!isNarrating}
                    className={`p-3 rounded-xl transition-all ${isNarrating ? 'bg-[var(--foreground)] text-[var(--background)]' : 'bg-[var(--surface)] text-[var(--muted)]'}`}
                    title="Stop narration"
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
          <div className="p-4 md:p-8 bg-[var(--background)]">
            <div className="max-w-3xl mx-auto">
              <form onSubmit={handleSubmit} className="relative group">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => { setInputValue(e.target.value); stopNarration(); }}
                  placeholder={
                    searchMode === SearchMode.BOOK
                      ? "Search book (e.g. Atomic Habits)..."
                      : "Search case study..."
                  }
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl py-4 pl-5 pr-24 focus:outline-none focus:border-[var(--muted-strong)] focus:bg-[var(--surface-strong)] transition-all text-sm md:text-base placeholder-[var(--muted)]"
                />

                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button 
                    type="submit"
                    disabled={!inputValue.trim() || isLoading}
                    className={`p-2 rounded-xl transition-all ${inputValue.trim() ? 'bg-[var(--foreground)] text-[var(--background)]' : 'bg-[var(--surface)] text-[var(--muted)]'}`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </form>
              <p className="text-[10px] text-center text-[var(--muted)] mt-3 uppercase tracking-widest">
                Processing in {settings.language} Language
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
              </div>
              <button onClick={closeListenModal} className="text-[var(--muted)] hover:text-[var(--foreground)]">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-3">
                {selectedHistory.conversation?.map((entry, index) => (
                  <div key={`${entry.role}-${index}`} className={`p-3 rounded-xl border ${entry.role === 'user' ? 'border-[var(--border)] bg-[var(--surface-strong)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                    <p className="text-[11px] uppercase tracking-widest text-[var(--muted)] mb-2">{entry.role === 'user' ? 'You' : 'Narrator'}</p>
                    <p className="text-sm text-[var(--foreground)] whitespace-pre-line">{entry.content}</p>
                  </div>
                ))}
              </div>

              {selectedHistory.suggestion && (
                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]">
                  <p className="text-[11px] uppercase tracking-widest text-[var(--muted)] mb-2">Suggested Next</p>
                  <p className="text-sm text-[var(--foreground)]">{selectedHistory.suggestion}</p>
                </div>
              )}
            </div>

            <div className="p-6 pt-0 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  if (isNarrating) {
                    handleStopNarration();
                  } else {
                    narrateHistoryItem(selectedHistory);
                  }
                }}
                className={`px-5 py-3 font-bold rounded-2xl transition-colors uppercase tracking-widest text-xs ${isNarrating ? 'bg-[var(--surface-strong)] text-[var(--foreground)]' : 'bg-[var(--foreground)] text-[var(--background)] hover:opacity-90'}`}
              >
                {isNarrating ? 'Stop Narration' : 'Narrate Now'}
              </button>
              <div className="flex flex-wrap gap-2 items-center">
                {isLoadingListenSuggestions && listenSuggestions.length === 0 && (
                  <span className="text-xs text-[var(--muted)]">Loading suggestions...</span>
                )}
                {listenSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleListenSuggestionClick(suggestion)}
                    className="px-3 py-2 rounded-2xl border border-[var(--border)] text-xs uppercase tracking-widest text-[var(--muted-strong)] hover:text-[var(--foreground)] hover:border-[var(--muted-strong)] transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
