import React from 'react';
import { Settings, VoiceName, Language, TextToSpeechProvider, VoiceGender } from '../app/types';
import { ELEVENLABS_VOICES, getVoicesForLanguageAndGender } from '../app/services/elevenLabsService';

interface SettingsModalProps {
  settings: Settings;
  onSettingsChange: (newSettings: Settings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onSettingsChange, onClose }: SettingsModalProps) {
  const availableVoices = getVoicesForLanguageAndGender(settings.language, settings.voiceGender);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="relative bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 border border-gray-700">
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="absolute right-4 top-4 rounded-full border border-gray-600 bg-gray-900/70 px-2.5 py-1 text-sm font-semibold text-gray-200 hover:bg-gray-700"
        >
          X
        </button>
        <h2 className="text-2xl font-bold text-lime-400 mb-6">Narration Settings</h2>

        {/* Text-to-Speech Provider */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-300 mb-2">
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
            className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-lime-400"
          >
            <option value={TextToSpeechProvider.ELEVENLABS}>ElevenLabs (Advanced)</option>
            <option value={TextToSpeechProvider.OPENAI}>OpenAI</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">
            ElevenLabs offers better voice quality and more language support
          </p>
        </div>

        {/* Language Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-300 mb-2">
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
            className="w-full bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-lime-400"
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
          <label className="block text-sm font-semibold text-gray-300 mb-2">
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
                    ? 'bg-lime-400 text-gray-900'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {gender}
              </button>
            ))}
          </div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
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
                      ? 'bg-lime-400 text-gray-900 font-semibold'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <div className="font-semibold capitalize">{voice.name}</div>
                  <div className="text-xs opacity-80">{voice.description}</div>
                </button>
              );
            })}
          </div>
          {availableVoices.length === 0 && (
            <p className="text-xs text-red-400">No voices available for this language</p>
          )}
        </div>

        {/* Narration Type */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Narration Style
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
                    ? 'bg-lime-400 text-gray-900'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Narration Duration */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Narration Duration: {settings.narrationTime} minutes
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
            className="w-full accent-lime-400"
          />
        </div>

        {/* Background Music Settings */}
        <div className="mb-6 p-4 bg-gray-700/50 rounded-lg border border-gray-600">
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
              className="w-4 h-4 accent-lime-400 cursor-pointer"
            />
            <span className="text-sm font-semibold text-gray-300">
              Enable Genre-Specific Background Music
            </span>
          </label>

          {settings.enableBackgroundMusic && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">
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
                className="w-full accent-lime-400"
              />
            </div>
          )}
        </div>

        {/* Settings Info */}
        <div className="mb-6 p-3 bg-blue-900/30 rounded-lg border border-blue-700 text-xs text-blue-200">
          <p className="font-semibold mb-1">💡 Voice & Language Support</p>
          <p>
            Each voice supports specific languages. Your selected voice will auto-adjust to work with the chosen
            language for optimal pronunciation.
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full bg-lime-400 hover:bg-lime-500 text-gray-900 font-semibold py-2 rounded-lg transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
