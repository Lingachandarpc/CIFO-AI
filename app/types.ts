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

export interface Settings {
  narrationTime: number;
  narrationType: "Realistic" | "Dramatic" | "Educational";
  voiceType: VoiceName;
  language: Language;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  mode?: SearchMode;
  audioBlob?: string;
}

export interface HistoryItem {
  id: string;
  query: string;
  mode: SearchMode;
  timestamp: Date;
}
