export enum SearchMode {
  BOOK = "BOOK",
  CASE_STUDY = "CASE_STUDY",
  ASK = "ASK",
}

export enum Language {
  ENGLISH = "English",
  SPANISH = "Spanish",
  FRENCH = "French",
  GERMAN = "German",
  CHINESE = "Chinese",
  JAPANESE = "Japanese",
  HINDI = "Hindi",
  PORTUGUESE = "Portuguese",
  TAMIL = "Tamil",
  TELUGU = "Telugu",
  MALAYALAM = "Malayalam",
  KANNADA = "Kannada",
  BENGALI = "Bengali",
  MARATHI = "Marathi",
  GUJARATI = "Gujarati",
  PUNJABI = "Punjabi",
}

export enum VoiceName {
  ZEPHYR = "zephyr",
  KORE = "kore",
  PUCK = "puck",
  CHARON = "charon",
  FENRIR = "fenrir",
}

export enum VoiceGender {
  AUTO = "auto",
  MALE = "male",
  FEMALE = "female",
}

export enum TextToSpeechProvider {
  OPENAI = "openai",
  ELEVENLABS = "elevenlabs",
  OPEN_SOURCE = "open-source",
}

export enum AIModel {
  AUTO = "auto",
  OPENAI = "openai",
  CLAUDE_SONNET = "claude-sonnet",
  XAI = "xai",
}

export enum Genre {
  PERSONAL_FINANCE = "Personal Finance",
  TECHNOLOGY = "Technology",
  BUSINESS = "Business",
  PSYCHOLOGY = "Psychology",
  HEALTH = "Health",
  HISTORY = "History",
  SCIENCE = "Science",
  SELF_HELP = "Self-Help",
  FICTION = "Fiction",
  BIOGRAPHY = "Biography",
  DEFAULT = "Default",
}

export interface Settings {
  narrationTime: number;
  narrationType: "Realistic" | "Dramatic" | "Educational";
  voiceType: VoiceName;
  voiceGender: VoiceGender;
  language: Language;
  ttsProvider: TextToSpeechProvider;
  aiModel: AIModel;
  enableBackgroundMusic: boolean;
  backgroundMusicVolume: number; // 0.0 - 1.0
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  mode?: SearchMode;
  audioBlob?: string;
  modelUsed?: AIModel;
}

export interface VoiceProfile {
  genre?: string;
  tone?: "calm" | "neutral" | "intense";
  pace?: "slow" | "medium" | "fast";
  pitch?: "low" | "medium" | "high";
  slang?: "none" | "light" | "moderate";
}

export interface HistoryItem {
  id: string;
  query: string;
  mode: SearchMode;
  timestamp: Date;
  interactionMode: "read" | "listen";
  response?: string;
  audioBlob?: string;
  genre?: string;
  suggestion?: string;
  suggestions?: string[];
  modelUsed?: AIModel;
  voiceProfile?: VoiceProfile;
  conversation?: Array<Pick<ChatMessage, "role" | "content" | "timestamp">>;
}
