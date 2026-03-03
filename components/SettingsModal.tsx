import React from 'react';
import { Settings, Language, TextToSpeechProvider, VoiceGender } from '../app/types';
import { getVoicesForLanguageAndGender } from '../app/services/elevenLabsService';

interface SettingsModalProps {
  settings: Settings;
  onSettingsChange: (newSettings: Settings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onSettingsChange, onClose }: SettingsModalProps) {
  const resolvePreferredVoice = (gender: VoiceGender) => {
    const preferred = getVoicesForLanguageAndGender(settings.language, gender);
    return preferred[0] || settings.voiceType;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="relative bg-[var(--surface)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 border border-[var(--border)]">
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="absolute right-4 top-4 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2.5 py-1 text-sm font-semibold text-[var(--foreground)] hover:opacity-90"
        >
          X
        </button>
        <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6">Response Settings</h2>

        {/* Text-to-Speech Provider */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">
            Text-to-Speech Provider
          </label>
          <select
            value={settings.ttsProvider}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                ttsProvider: e.target.value as TextToSpeechProvider,
              })
            }
            className="w-full bg-[var(--surface-strong)] text-[var(--foreground)] border border-[var(--border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--muted-strong)]"
          >
            <option value={TextToSpeechProvider.GEMINI}>Gemini (Default)</option>
            <option value={TextToSpeechProvider.ELEVENLABS}>ElevenLabs (Advanced)</option>
            <option value={TextToSpeechProvider.GOOGLE}>Google Cloud TTS</option>
            <option value={TextToSpeechProvider.OPENAI}>OpenAI</option>
            <option value={TextToSpeechProvider.OPEN_SOURCE}>Open-source (Browser TTS)</option>
          </select>
          <p className="text-xs text-[var(--muted)] mt-1">
            Gemini TTS supports all languages natively. Falls back to ElevenLabs, then browser TTS.
          </p>
        </div>

        {/* Language Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">
            Language
          </label>
          <select
            value={settings.language}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                language: e.target.value as Language,
                voiceType: getVoicesForLanguageAndGender(e.target.value as Language, settings.voiceGender)[0] || settings.voiceType,
              })
            }
            className="w-full bg-[var(--surface-strong)] text-[var(--foreground)] border border-[var(--border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--muted-strong)]"
          >
            {Object.values(Language).map((value: string) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {/* Voice Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">
            Voice Gender
          </label>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[VoiceGender.AUTO, VoiceGender.FEMALE, VoiceGender.MALE].map((gender) => (
              <button
                key={gender}
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    voiceGender: gender,
                    voiceType: resolvePreferredVoice(gender),
                  })
                }
                className={`p-2 rounded transition-all text-sm font-medium capitalize ${
                  settings.voiceGender === gender
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'bg-[var(--surface-strong)] text-[var(--muted-strong)] hover:bg-[var(--surface)]'
                }`}
              >
                {gender}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">
            Auto matches language cadence. Selected: {settings.voiceGender}.
          </p>
        </div>

        {/* Response Style */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">
            Response Style
          </label>
          <div className="grid grid-cols-3 gap-3">
            {['Realistic', 'Practical', 'Educational'].map((type) => (
              <button
                key={type}
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    narrationType: type as 'Realistic' | 'Practical' | 'Educational',
                  })
                }
                className={`p-2 rounded transition-all text-sm font-medium ${
                  settings.narrationType === type
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'bg-[var(--surface-strong)] text-[var(--muted-strong)] hover:bg-[var(--surface)]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Settings Info */}
        <div className="mb-6 p-3 bg-[var(--surface-strong)] rounded-lg border border-[var(--border)] text-xs text-[var(--muted-strong)]">
          <p className="font-semibold mb-1">Voice & Language Support</p>
          <p>
            Each voice supports specific languages. Your selected voice will auto-adjust to work with the chosen
            language for optimal pronunciation.
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full bg-[var(--foreground)] hover:opacity-90 text-[var(--background)] font-semibold py-2 rounded-lg transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
