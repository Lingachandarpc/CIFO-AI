import React from 'react';
import { Settings, VoiceName, Language, TextToSpeechProvider, VoiceGender, AIModel } from '../app/types';
import { ELEVENLABS_VOICES, getVoicesForLanguageAndGender } from '../app/services/elevenLabsService';

interface SettingsModalProps {
  settings: Settings;
  onSettingsChange: (newSettings: Settings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onSettingsChange, onClose }: SettingsModalProps) {
  const availableVoices = getVoicesForLanguageAndGender(settings.language, settings.voiceGender);

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

        {/* AI Model Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">
            AI Model
          </label>
          <select
            value={settings.aiModel}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                aiModel: e.target.value as AIModel,
              })
            }
            className="w-full bg-[var(--surface-strong)] text-[var(--foreground)] border border-[var(--border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--muted-strong)]"
          >
            <option value={AIModel.AUTO}>Auto (fastest available)</option>
            <option value={AIModel.OPENAI}>OpenAI</option>
            <option value={AIModel.CLAUDE_SONNET}>Claude Sonnet</option>
            <option value={AIModel.XAI}>xAI</option>
          </select>
          <p className="text-xs text-[var(--muted)] mt-1">
            Auto picks the lowest-latency model based on recent responses.
          </p>
        </div>

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
            <option value={TextToSpeechProvider.ELEVENLABS}>ElevenLabs (Advanced)</option>
            <option value={TextToSpeechProvider.OPENAI}>OpenAI</option>
            <option value={TextToSpeechProvider.OPEN_SOURCE}>Open-source (Browser TTS)</option>
          </select>
          <p className="text-xs text-[var(--muted)] mt-1">
            Falls back to browser TTS if cloud providers are unavailable.
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
          <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">
            Voice Persona
          </label>
          <div className="grid grid-cols-1 gap-3">
            {availableVoices.map((voiceName: VoiceName) => {
              const voice = ELEVENLABS_VOICES[voiceName];
              return (
                <button
                  key={voiceName}
                  onClick={() =>
                    onSettingsChange({
                      ...settings,
                      voiceType: voiceName,
                    })
                  }
                  className={`p-3 rounded-lg text-left transition-all ${
                    settings.voiceType === voiceName
                      ? 'bg-[var(--foreground)] text-[var(--background)] font-semibold'
                      : 'bg-[var(--surface-strong)] text-[var(--muted-strong)] hover:bg-[var(--surface)]'
                  }`}
                >
                  <div className="font-semibold capitalize">{voice.name}</div>
                  <div className="text-xs opacity-80">{voice.description}</div>
                </button>
              );
            })}
          </div>
          {availableVoices.length === 0 && (
            <p className="text-xs text-[var(--muted)]">No voices available for this language</p>
          )}
        </div>

        {/* Response Style */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">
            Response Style
          </label>
          <div className="grid grid-cols-3 gap-3">
            {['Realistic', 'Dramatic', 'Educational'].map((type) => (
              <button
                key={type}
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    narrationType: type as 'Realistic' | 'Dramatic' | 'Educational',
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

        {/* Read/Listen Duration */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">
            Read/Listen Time: {settings.narrationTime} minutes
          </label>
          <input
            type="range"
            min="2"
            max="15"
            value={settings.narrationTime}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                narrationTime: parseInt(e.target.value),
              })
            }
            className="w-full accent-[var(--foreground)]"
          />
        </div>

        {/* Background Music Settings */}
        <div className="mb-6 p-4 bg-[var(--surface-strong)] rounded-lg border border-[var(--border)]">
          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={settings.enableBackgroundMusic}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  enableBackgroundMusic: e.target.checked,
                })
              }
              className="w-4 h-4 accent-[var(--foreground)] cursor-pointer"
            />
            <span className="text-sm font-semibold text-[var(--muted-strong)]">
              Enable Genre-Specific Background Music
            </span>
          </label>

          {settings.enableBackgroundMusic && (
            <div>
              <label className="block text-xs font-semibold text-[var(--muted)] mb-2">
                Music Volume: {Math.round(settings.backgroundMusicVolume * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.backgroundMusicVolume}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    backgroundMusicVolume: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-[var(--foreground)]"
              />
            </div>
          )}
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
