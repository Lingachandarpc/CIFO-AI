"use client";

import React, { useState, useEffect, useRef } from 'react';
import { SearchMode, Settings, ChatMessage, HistoryItem, Language, VoiceGender, TextToSpeechProvider, AIModel, DEFAULT_GOOGLE_VOICE } from './types';
import { listGoogleVoices, GoogleVoice } from './services/googleTtsService';
import { BookIcon, CaseStudyIcon, SettingsIcon, HistoryIcon, PlayIcon, MicIcon, GlobeIcon } from '../components/Icons';
import { generateNarrative, generateSpeech, decodeAudio, getAudioBuffer } from './services/openaiService';

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>(SearchMode.BOOK);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    narrationType: 'Realistic',
    voiceType: DEFAULT_GOOGLE_VOICE,
    voiceGender: VoiceGender.AUTO,
    language: Language.ENGLISH,
    ttsProvider: TextToSpeechProvider.GOOGLE,
    aiModel: AIModel.AUTO,
    enableBackgroundMusic: true,
    backgroundMusicVolume: 0.15,
  });
  const [googleVoices, setGoogleVoices] = useState<GoogleVoice[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  interface SpeechRecognitionLike {
    continuous?: boolean;
    interimResults?: boolean;
    lang?: string;
    onstart?: () => void;
    onresult?: (event: { results: Array<Array<{ transcript: string }>> }) => void;
    onerror?: () => void;
    onend?: () => void;
    start?: () => void;
    stop?: () => void;
  }

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

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
        if (currentSourceRef.current) {
          try { currentSourceRef.current.stop(); } catch {};
          try { currentSourceRef.current.disconnect(); } catch {}
          currentSourceRef.current = null;
        }
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (currentSourceRef.current) {
          try { currentSourceRef.current.stop(); } catch {};
          try { currentSourceRef.current.disconnect(); } catch {}
          currentSourceRef.current = null;
        }
        setInputValue(prev => prev ? `${prev} ${transcript}` : transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    listGoogleVoices(settings.language)
      .then((voices) => {
        if (!isActive) return;
        setGoogleVoices(voices);
        if (!voices.find((voice) => voice.name === settings.voiceType)) {
          setSettings((prev) => ({
            ...prev,
            voiceType: voices[0]?.name || DEFAULT_GOOGLE_VOICE,
          }));
        }
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, [settings.language, settings.voiceType]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop?.();
    } else {
      setIsListening(true);
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
      recognitionRef.current?.start?.();
    }
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('narrative_history_guest');
    if (savedHistory) {
      const parsed = JSON.parse(savedHistory) as HistoryItem[];
      setHistory(parsed.map((item) => ({
        ...item,
        interactionMode: item.interactionMode || "read",
      })));
    }
  }, []);

  const saveToHistory = (query: string, mode: SearchMode) => {
    const newItem: HistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      query,
      mode,
      timestamp: new Date(),
      interactionMode: "read",
    };
                  {googleVoices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} ({voice.ssmlGender})
                    </option>
                  ))}
  const handlePlayAudio = async (base64: string) => {
    initAudio();
    if (!audioContextRef.current) return;

    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {};
      try { currentSourceRef.current.disconnect(); } catch {}
      currentSourceRef.current = null;
    }

    const data = decodeAudio(base64);
    const buffer = await getAudioBuffer(data, audioContextRef.current);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.start(0);
    currentSourceRef.current = source;

    try { recognitionRef.current?.start?.(); } catch {}
  };

  const stopNarration = () => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch {};
      try { currentSourceRef.current.disconnect(); } catch {}
      currentSourceRef.current = null;
    }
    try { window.speechSynthesis.cancel(); } catch {}
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    initAudio();
    const userQuery = inputValue;
    const currentMode = searchMode;
    setInputValue('');
    setIsLoading(true);

    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userQuery,
      timestamp: new Date(),
      mode: currentMode,
    };

    setMessages(prev => [...prev, newUserMsg]);
    saveToHistory(userQuery, currentMode);

    try {
      const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
      const narrativeResponse = await generateNarrative(userQuery, currentMode, settings, chatHistory);
      const narrativeText = narrativeResponse.narration;
      
      let audioBase64 = '';
      if (!narrativeText.toLowerCase().includes("search in books instead")) {
        audioBase64 = await generateSpeech(narrativeText.slice(0, 1000), settings.voiceType) || '';
      }

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: narrativeText,
        timestamp: new Date(),
        audioBlob: audioBase64,
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (audioBase64) {
        handlePlayAudio(audioBase64);
      }

      if (!narrativeText.toLowerCase().includes("search in books instead")) {
        const perspectivePrompt: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: settings.language === Language.ENGLISH 
            ? "I hope you enjoyed the narration. What's your perspective on this story or case? How do you think we can align or adopt these lessons in the real world?"
            : `I hope you enjoyed the narration in ${settings.language}. What's your perspective?`,
          timestamp: new Date(),
        };
        setTimeout(() => setMessages(prev => [...prev, perspectivePrompt]), 1000);
      }

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

  return (
    <div className="flex h-screen w-full bg-black text-white font-sans overflow-hidden">
      {/* Sidebar - History */}
      <aside className="w-64 border-r border-neutral-800 hidden md:flex md:flex-col">
        <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center">
            <span className="text-black font-bold text-xl">S</span>
          </div>
          <span className="font-bold tracking-tight text-lg">Self \ Fles</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-4 text-neutral-400 text-xs font-semibold uppercase tracking-widest">
            <HistoryIcon className="w-4 h-4" />
            <span>Neural History</span>
          </div>
          <div className="space-y-1">
            {history.length === 0 ? (
              <p className="text-neutral-600 text-sm italic">No recent explorations</p>
            ) : (
              history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setInputValue(item.query);
                    setSearchMode(item.mode);
                  }}
                  className="w-full text-left p-3 rounded-lg hover:bg-neutral-900 transition-colors text-sm text-neutral-300 truncate"
                >
                  <div className="flex items-center gap-2">
                    {item.mode === SearchMode.BOOK ? <BookIcon className="w-3 h-3 text-neutral-400" /> : <CaseStudyIcon className="w-3 h-3 text-neutral-400" />}
                    <span className="truncate">{item.query}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-neutral-800 flex flex-col gap-2">
          <div className="px-3 py-1 flex items-center gap-2 text-[10px] text-neutral-500 uppercase tracking-widest">
            <GlobeIcon className="w-3 h-3" />
            <span>{settings.language} Mode</span>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-900 transition-colors text-neutral-400"
          >
            <SettingsIcon />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative bg-black">
        {/* Header (Mobile) */}
        <header className="md:hidden p-4 border-b border-neutral-800 flex justify-between items-center">
          <span className="font-bold">Self \ Fles</span>
          <button onClick={() => setIsSettingsOpen(true)}><SettingsIcon /></button>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-0 scroll-smooth">
          <div className="max-w-3xl mx-auto py-10 space-y-8">
            {messages.length === 0 && (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center border border-neutral-800">
                  <span className="text-3xl font-bold">S</span>
                </div>
                <div>
                  <h1 className="text-3xl font-bold mb-2">Narrate in {settings.language}</h1>
                  <p className="text-neutral-500 max-w-sm mx-auto">Explore books or real-world cases with realistic neural voice interaction.</p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`p-4 rounded-2xl text-[15px] leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-neutral-900 border border-neutral-800 text-white' 
                      : 'bg-transparent text-neutral-100'
                  }`}>
                    {msg.content}
                    {msg.audioBlob && (
                      <button 
                        onClick={() => handlePlayAudio(msg.audioBlob!)}
                        className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-white text-black rounded-full text-xs font-bold hover:bg-neutral-200 transition-colors"
                      >
                        <PlayIcon className="w-4 h-4" />
                        Listen Narration
                      </button>
                    )}
                  </div>
                  <div className="text-[10px] text-neutral-600 px-2 flex items-center gap-2 uppercase tracking-tighter">
                    {msg.role === 'assistant' ? 'Self \\ Fles' : 'You'} 
                    <span>•</span>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl animate-pulse">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-neutral-600 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-neutral-600 rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-neutral-600 rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="p-4 md:p-8 bg-linear-to-t from-black via-black to-transparent">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button 
                  type="button"
                  onClick={() => setSearchMode(SearchMode.BOOK)}
                  className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold ${searchMode === SearchMode.BOOK ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-neutral-500 hover:text-white'}`}
                >
                  <BookIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Books</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setSearchMode(SearchMode.CASE_STUDY)}
                  className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold ${searchMode === SearchMode.CASE_STUDY ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-neutral-500 hover:text-white'}`}
                >
                  <CaseStudyIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Case Study</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setSearchMode(SearchMode.ASK)}
                  className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold ${searchMode === SearchMode.ASK ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-neutral-500 hover:text-white'}`}
                >
                  <CaseStudyIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Ask</span>
                </button>
              </div>

              <input
                type="text"
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); stopNarration(); }}
                placeholder={
                  searchMode === SearchMode.BOOK
                    ? "Search book (e.g. Harry Potter)..."
                    : searchMode === SearchMode.CASE_STUDY
                    ? "Search case study..."
                    : "Ask a question or concern..."
                }
                className="w-full bg-neutral-900/50 border border-neutral-800 rounded-2xl py-4 pl-56 md:pl-48 pr-28 focus:outline-none focus:border-neutral-600 focus:bg-neutral-900 transition-all text-sm md:text-base placeholder-neutral-600"
              />

              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-2 rounded-xl transition-all ${isListening ? 'bg-white text-black animate-pulse' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                  title="Voice to Text"
                >
                  <MicIcon className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode(SearchMode.ASK)}
                  className={`p-2 rounded-xl transition-all ${searchMode === SearchMode.ASK ? 'bg-white text-black' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                  title="Ask"
                >
                  Ask
                </button>
                <button 
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className={`p-2 rounded-xl transition-all ${inputValue.trim() ? 'bg-white text-black' : 'bg-neutral-800 text-neutral-600'}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </form>
            <p className="text-[10px] text-center text-neutral-600 mt-3 uppercase tracking-widest">
              Processing in {settings.language} Language
            </p>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-neutral-800 flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <SettingsIcon />
                Configuration
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-neutral-500 hover:text-white">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Language Selection */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-neutral-400 block uppercase tracking-wider">System Language</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.values(Language) as Language[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSettings({ ...settings, language: lang })}
                      className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all ${settings.language === lang ? 'bg-white text-black border-white' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-500'}`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-semibold text-neutral-400 block uppercase tracking-wider">Response Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Realistic', 'Dramatic', 'Educational'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setSettings({ ...settings, narrationType: type as Settings['narrationType'] })}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${settings.narrationType === type ? 'bg-white text-black border-white' : 'bg-transparent text-neutral-500 border-neutral-800 hover:border-neutral-600'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-semibold text-neutral-400 block uppercase tracking-wider">Neural Voice Persona</label>
                <select 
                  value={settings.voiceType}
                  onChange={(e) => setSettings({ ...settings, voiceType: e.target.value })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl py-3 px-4 focus:outline-none focus:border-white text-sm"
                >
                  {googleVoices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} ({voice.ssmlGender})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 pt-0">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-neutral-200 transition-colors uppercase tracking-widest text-sm"
              >
                Save Protocol
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
}