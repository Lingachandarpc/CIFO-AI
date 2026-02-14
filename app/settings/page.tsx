"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Settings, Language, VoiceName, TextToSpeechProvider, VoiceGender, AIModel } from "../types";
import { ELEVENLABS_VOICES, getVoicesForLanguageAndGender } from "../services/elevenLabsService";

const defaultSettings: Settings = {
  narrationTime: 5,
  narrationType: "Realistic",
  voiceType: VoiceName.ZEPHYR,
  voiceGender: VoiceGender.AUTO,
  language: Language.ENGLISH,
  ttsProvider: TextToSpeechProvider.ELEVENLABS,
  aiModel: AIModel.AUTO,
  enableBackgroundMusic: true,
  backgroundMusicVolume: 0.15,
};

type ProfileForm = {
  name: string;
  age: string;
  location: string;
  interests: string;
  pulse: string;
  bio: string;
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"narration" | "profile">("narration");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [profile, setProfile] = useState<ProfileForm>({
    name: "",
    age: "",
    location: "",
    interests: "",
    pulse: "",
    bio: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const availableVoices = useMemo(
    () => getVoicesForLanguageAndGender(settings.language, settings.voiceGender),
    [settings.language, settings.voiceGender]
  );

  useEffect(() => {
    const loadSettingsAndProfile = async () => {
      try {
        const [settingsRes, profileRes] = await Promise.all([
          fetch("/api/chronoread/settings", { cache: "no-store", credentials: "include" }),
          fetch("/api/chronoread/profile", { cache: "no-store", credentials: "include" }),
        ]);

        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData?.settings) {
            const loadedModel = settingsData.settings.aiModel;
            const safeModel =
              loadedModel === AIModel.OPENAI ||
              loadedModel === AIModel.CLAUDE_SONNET ||
              loadedModel === AIModel.XAI ||
              loadedModel === AIModel.AUTO
                ? loadedModel
                : AIModel.AUTO;
            setSettings((prev) => ({ ...prev, ...settingsData.settings, aiModel: safeModel }));
          }
        }

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfile({
            name: profileData?.profile?.name || "",
            age: profileData?.profile?.age ? String(profileData.profile.age) : "",
            location: profileData?.profile?.location || "",
            interests: profileData?.profile?.interests || "",
            pulse: profileData?.profile?.pulse || "",
            bio: profileData?.profile?.bio || "",
          });
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadSettingsAndProfile();
  }, []);

  const handleProfileChange = (field: keyof ProfileForm, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/chronoread/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      setStatusMessage("Response settings saved.");
    } catch (error) {
      console.error("Error saving settings:", error);
      setStatusMessage("Unable to save response settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/chronoread/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          age: profile.age ? parseInt(profile.age, 10) : undefined,
          location: profile.location,
          interests: profile.interests,
          pulse: profile.pulse,
          bio: profile.bio,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save profile");
      }

      setStatusMessage("Profile updated.");
    } catch (error) {
      console.error("Error saving profile:", error);
      setStatusMessage("Unable to save profile details.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-6 py-10">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-sm text-[var(--muted)]">Adjust response preferences and profile details.</p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-strong)]"
          >
            Back to Home
          </Link>
        </div>

        <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("narration")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all ${
              activeTab === "narration"
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Response
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all ${
              activeTab === "profile"
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Profile
          </button>
        </div>

        {statusMessage && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
            {statusMessage}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-[var(--muted)]">
            Loading settings...
          </div>
        ) : activeTab === "narration" ? (
          <div className="space-y-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div>
              <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">AI Model</label>
              <select
                value={settings.aiModel}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    aiModel: e.target.value as AIModel,
                  }))
                }
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)]"
              >
                <option value={AIModel.AUTO}>Auto (fastest available)</option>
                <option value={AIModel.OPENAI}>OpenAI</option>
                <option value={AIModel.CLAUDE_SONNET}>Claude Sonnet</option>
                <option value={AIModel.XAI}>xAI</option>
              </select>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Auto uses the lowest-latency model based on recent responses.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Text-to-Speech Provider</label>
              <select
                value={settings.ttsProvider}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    ttsProvider: e.target.value as TextToSpeechProvider,
                  }))
                }
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)]"
              >
                <option value={TextToSpeechProvider.ELEVENLABS}>ElevenLabs (Advanced)</option>
                <option value={TextToSpeechProvider.OPENAI}>OpenAI</option>
                <option value={TextToSpeechProvider.OPEN_SOURCE}>Open-source (Browser TTS)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Language</label>
              <select
                value={settings.language}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    language: e.target.value as Language,
                  }))
                }
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)]"
              >
                {Object.values(Language).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Voice Gender</label>
              <div className="grid grid-cols-3 gap-3">
                {[VoiceGender.AUTO, VoiceGender.FEMALE, VoiceGender.MALE].map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    onClick={() => setSettings((prev) => ({ ...prev, voiceGender: gender }))}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-all ${
                      settings.voiceGender === gender
                        ? "bg-[var(--foreground)] text-[var(--background)]"
                        : "bg-[var(--surface-strong)] text-[var(--muted-strong)] hover:bg-[var(--surface)]"
                    }`}
                  >
                    {gender}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Voice Persona</label>
              <div className="grid gap-3">
                {availableVoices.map((voiceName) => {
                  const voice = ELEVENLABS_VOICES[voiceName];
                  return (
                    <button
                      key={voiceName}
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, voiceType: voiceName }))}
                      className={`rounded-xl border px-4 py-3 text-left transition-all ${
                        settings.voiceType === voiceName
                          ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                          : "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted-strong)] hover:bg-[var(--surface)]"
                      }`}
                    >
                      <div className="font-semibold capitalize">{voice.name}</div>
                      <div className="text-xs opacity-80">{voice.description}</div>
                    </button>
                  );
                })}
              </div>
              {availableVoices.length === 0 && (
                <p className="mt-2 text-xs text-[var(--muted)]">No voices available for this language.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Response Style</label>
              <div className="grid grid-cols-3 gap-3">
                {(["Realistic", "Dramatic", "Educational"] as Settings["narrationType"][]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSettings((prev) => ({ ...prev, narrationType: type }))}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                      settings.narrationType === type
                        ? "bg-[var(--foreground)] text-[var(--background)]"
                        : "bg-[var(--surface-strong)] text-[var(--muted-strong)] hover:bg-[var(--surface)]"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">
                Read/Listen Time: {settings.narrationTime} minutes
              </label>
              <input
                type="range"
                min="2"
                max="15"
                value={settings.narrationTime}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    narrationTime: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full accent-[var(--foreground)]"
              />
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <label className="flex items-center gap-2 mb-3 text-sm font-semibold text-[var(--muted-strong)]">
                <input
                  type="checkbox"
                  checked={settings.enableBackgroundMusic}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      enableBackgroundMusic: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-[var(--foreground)]"
                />
                Enable Genre-Specific Background Music
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
                      setSettings((prev) => ({
                        ...prev,
                        backgroundMusicVolume: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full accent-[var(--foreground)]"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="w-full rounded-xl bg-[var(--foreground)] py-3 text-sm font-bold uppercase tracking-widest text-[var(--background)] hover:opacity-90 disabled:opacity-60"
            >
              {isSavingSettings ? "Saving..." : "Save Response Settings"}
            </button>
          </div>
        ) : (
          <div className="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => handleProfileChange("name", e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Age</label>
                <input
                  type="number"
                  min="13"
                  max="120"
                  value={profile.age}
                  onChange={(e) => handleProfileChange("age", e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)]"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Location</label>
                <input
                  type="text"
                  value={profile.location}
                  onChange={(e) => handleProfileChange("location", e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Interests</label>
                <input
                  type="text"
                  value={profile.interests}
                  onChange={(e) => handleProfileChange("interests", e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Personality Pulse</label>
              <input
                type="text"
                value={profile.pulse}
                onChange={(e) => handleProfileChange("pulse", e.target.value)}
                placeholder="Calm, curious, intense..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--muted-strong)] mb-2">Bio</label>
              <textarea
                value={profile.bio}
                onChange={(e) => handleProfileChange("bio", e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)]"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="w-full rounded-xl bg-[var(--foreground)] py-3 text-sm font-bold uppercase tracking-widest text-[var(--background)] hover:opacity-90 disabled:opacity-60"
            >
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
