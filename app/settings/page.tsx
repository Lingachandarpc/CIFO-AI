"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings, Language, TextToSpeechProvider, VoiceGender, AIModel, DEFAULT_GOOGLE_VOICE } from "../types";
import { filterVoicesByGender, listGoogleVoices, GoogleVoice } from "../services/googleTtsService";

const defaultSettings: Settings = {
  narrationType: "Realistic",
  voiceType: DEFAULT_GOOGLE_VOICE,
  voiceGender: VoiceGender.AUTO,
  language: Language.ENGLISH,
  ttsProvider: TextToSpeechProvider.GOOGLE,
  aiModel: AIModel.AUTO,
  enableBackgroundMusic: false,
  backgroundMusicVolume: 0.15,
  enableWebSearch: true,
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
  const router = useRouter();
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
  const [googleVoices, setGoogleVoices] = useState<GoogleVoice[]>([]);

  const availableVoices = useMemo(
    () => filterVoicesByGender(googleVoices, settings.voiceGender),
    [googleVoices, settings.voiceGender]
  );
  const selectedVoice = useMemo(
    () => googleVoices.find((voice) => voice.name === settings.voiceType),
    [googleVoices, settings.voiceType]
  );

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

  useEffect(() => {
    if (!googleVoices.length) return;
    const candidates = availableVoices.length ? availableVoices : googleVoices;
    const nextVoice = candidates[0]?.name || DEFAULT_GOOGLE_VOICE;
    if (nextVoice && settings.voiceType !== nextVoice) {
      setSettings((prev) => ({
        ...prev,
        voiceType: nextVoice,
      }));
    }
  }, [googleVoices, availableVoices, settings.voiceType]);

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
              loadedModel === AIModel.GEMINI ||
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
      router.push("/");
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
      router.push("/");
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
                <option value={AIModel.GEMINI}>Gemini</option>
                <option value={AIModel.XAI}>xAI</option>
              </select>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Auto uses the lowest-latency model based on recent responses.
              </p>
            </div>
            {/* Text-to-Speech Provider selection is temporarily hidden while Google TTS is default. */}

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
              <p className="mt-2 text-xs text-[var(--muted)]">
                Auto matches language cadence. Selected: {settings.voiceGender}.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <p className="text-sm font-semibold text-[var(--muted-strong)]">Voice Persona</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Personas are auto-selected based on gender and language.
              </p>
              {selectedVoice && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Current voice: {selectedVoice.name} • {selectedVoice.ssmlGender} • {selectedVoice.languageCodes?.[0] || settings.language}
                </p>
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
            {/* Info Box: Auto-save from chat */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3">
              <p className="text-xs font-semibold text-[var(--muted-strong)] uppercase tracking-widest">ℹ️ Auto-Updated from Chat</p>
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Your profile is automatically updated from conversations. Fields below reflect information you mention during chats (e.g., "I'm from Chennai", "I'm 25 years old", "I love photography").
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-semibold text-[var(--muted-strong)]">Name</label>
                  <span className="group relative cursor-help">
                    <span className="text-[10px] text-[var(--muted)]">?</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[var(--surface-strong)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--muted)] whitespace-nowrap z-10">
                      Your full name as mentioned in chats
                    </div>
                  </span>
                </div>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => handleProfileChange("name", e.target.value)}
                  placeholder="John Doe"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)]"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-semibold text-[var(--muted-strong)]">Age</label>
                  <span className="group relative cursor-help">
                    <span className="text-[10px] text-[var(--muted)]">?</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[var(--surface-strong)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--muted)] whitespace-nowrap z-10">
                      Your age (13-120 years)
                    </div>
                  </span>
                </div>
                <input
                  type="number"
                  min="13"
                  max="120"
                  value={profile.age}
                  onChange={(e) => handleProfileChange("age", e.target.value)}
                  placeholder="25"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)]"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-semibold text-[var(--muted-strong)]">Location</label>
                  <span className="group relative cursor-help">
                    <span className="text-[10px] text-[var(--muted)]">?</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[var(--surface-strong)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--muted)] whitespace-nowrap z-10">
                      City, state, or country from chats
                    </div>
                  </span>
                </div>
                <input
                  type="text"
                  value={profile.location}
                  onChange={(e) => handleProfileChange("location", e.target.value)}
                  placeholder="Chennai, Tamil Nadu, India"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)]"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-semibold text-[var(--muted-strong)]">Interests</label>
                  <span className="group relative cursor-help">
                    <span className="text-[10px] text-[var(--muted)]">?</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[var(--surface-strong)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--muted)] whitespace-nowrap z-10">
                      Topics separated by | (auto-appended)
                    </div>
                  </span>
                </div>
                <input
                  type="text"
                  value={profile.interests}
                  onChange={(e) => handleProfileChange("interests", e.target.value)}
                  placeholder="AI | Photography | Travel | Science"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)]"
                />
                <p className="mt-1 text-[10px] text-[var(--muted)]">Separate multiple interests with |</p>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="block text-sm font-semibold text-[var(--muted-strong)]">Personality Pulse</label>
                <span className="group relative cursor-help">
                  <span className="text-[10px] text-[var(--muted)]">?</span>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[var(--surface-strong)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--muted)] whitespace-nowrap z-10">
                    Traits separated by | (auto-appended)
                  </div>
                </span>
              </div>
              <input
                type="text"
                value={profile.pulse}
                onChange={(e) => handleProfileChange("pulse", e.target.value)}
                placeholder="Curious | Creative | Detail-oriented | Calm"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)]"
              />
              <p className="mt-1 text-[10px] text-[var(--muted)]">Separate multiple traits with |</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="block text-sm font-semibold text-[var(--muted-strong)]">Bio</label>
                <span className="group relative cursor-help">
                  <span className="text-[10px] text-[var(--muted)]">?</span>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[var(--surface-strong)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--muted)] whitespace-nowrap z-10">
                    Background facts separated by |
                  </div>
                </span>
              </div>
              <textarea
                value={profile.bio}
                onChange={(e) => handleProfileChange("bio", e.target.value)}
                placeholder="Software engineer | Masters in CS | Passionate about AI ethics | Active photographer"
                rows={4}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] resize-none"
              />
              <p className="mt-1 text-[10px] text-[var(--muted)]">Separate multiple facts with |</p>
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
