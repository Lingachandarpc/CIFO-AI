"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Language, VoiceName, VoiceGender } from "../../types";

export default function SetupProfile() {
  const router = useRouter();
  const { status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState({
    name: "",
    bio: "",
    interests: "",
    location: "",
    age: "",
  });

  const [settings, setSettings] = useState({
    language: Language.ENGLISH,
    voiceType: VoiceName.ZEPHYR,
    voiceGender: VoiceGender.AUTO,
    narrationType: "Realistic",
    narrationTime: 5,
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    // Try to get stored user data from signup
    const storedData = sessionStorage.getItem("newUserData");
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setProfile((prev) => ({
          ...prev,
          name: data.name || "",
          interests: data.interests || "",
          age: data.age || "",
        }));
        // Clean up
        sessionStorage.removeItem("newUserData");
      } catch (e) {
        console.error("Error parsing stored data:", e);
      }
    }
  }, []);

  const handleProfileChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setProfile((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSettingsChange = (
    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: name === "narrationTime" ? parseInt(value) : value,
    }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Save profile
      if (profile.name || profile.bio || profile.interests || profile.location || profile.age) {
        const profileRes = await fetch("/api/chronoread/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: profile.name,
            bio: profile.bio,
            interests: profile.interests,
            location: profile.location,
            age: profile.age ? parseInt(profile.age) : undefined,
          }),
        });

        if (!profileRes.ok) {
          throw new Error("Failed to save profile");
        }
      }

      // Save settings
      const settingsRes = await fetch("/api/chronoread/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!settingsRes.ok) {
        throw new Error("Failed to save settings");
      }

      // Redirect to home
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[var(--muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[var(--foreground)] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-[var(--shadow)]">
            <span className="text-2xl font-bold text-[var(--background)]">S</span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Complete Your Profile</h1>
          <p className="text-[var(--muted)]">Help us personalize your Self \ Fles experience</p>
        </div>

        {/* Progress Indicator */}
        <div className="flex gap-2 mb-8">
          {[1, 2].map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 h-2 rounded-full transition-all ${
                step >= s ? "bg-[var(--foreground)]" : "bg-[var(--surface-strong)]"
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-[var(--foreground)] text-sm">{error}</p>
          </div>
        )}

        {/* Form */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 mb-6">
          {step === 1 ? (
            // Profile Step
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">Profile Information</h2>

              <div>
                <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={profile.name}
                  onChange={handleProfileChange}
                  placeholder="Your name"
                  className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
                  Bio
                </label>
                <textarea
                  name="bio"
                  value={profile.bio}
                  onChange={handleProfileChange}
                  placeholder="Tell us about yourself..."
                  rows={4}
                  className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
                    Location (Optional)
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={profile.location}
                    onChange={handleProfileChange}
                    placeholder="City, Country"
                    className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
                    Age (Optional)
                  </label>
                  <input
                    type="number"
                    name="age"
                    value={profile.age}
                    onChange={handleProfileChange}
                    placeholder="Your age"
                    min="13"
                    max="120"
                    className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
                  Interests (Optional)
                </label>
                <textarea
                  name="interests"
                  value={profile.interests}
                  onChange={handleProfileChange}
                  placeholder="e.g., Technology, Philosophy, Science Fiction, History..."
                  rows={3}
                  className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors resize-none"
                />
              </div>
            </div>
          ) : (
            // Settings Step
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">Narration Preferences</h2>

              <div>
                <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
                  Language
                </label>
                <select
                  name="language"
                  value={settings.language}
                  onChange={handleSettingsChange}
                  className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
                >
                  {Object.values(Language).map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
                  Neural Voice Persona
                </label>
                <select
                  name="voiceType"
                  value={settings.voiceType}
                  onChange={handleSettingsChange}
                  className="w-full bg-[var(--surface-strong)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
                >
                  <option value={VoiceName.ZEPHYR}>Zephyr (Smooth & Calming)</option>
                  <option value={VoiceName.KORE}>Kore (Professional & Sharp)</option>
                  <option value={VoiceName.PUCK}>Puck (Playful & High-energy)</option>
                  <option value={VoiceName.CHARON}>Charon (Deep & Narrator-like)</option>
                  <option value={VoiceName.FENRIR}>Fenrir (Bold & Powerful)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
                  Response Style
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {["Realistic", "Dramatic", "Educational"].map((style) => (
                    <button
                      key={style}
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          narrationType: style,
                        }))
                      }
                      className={`py-3 px-4 rounded-xl font-medium transition-all ${
                        settings.narrationType === style
                          ? "bg-[var(--foreground)] text-[var(--background)]"
                          : "bg-[var(--surface-strong)] border border-[var(--border)] text-[var(--muted-strong)] hover:border-[var(--muted-strong)]"
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--muted-strong)] mb-3">
                  Default Read/Listen Time: {settings.narrationTime} minutes
                </label>
                <input
                  type="range"
                  name="narrationTime"
                  min="1"
                  max="15"
                  value={settings.narrationTime}
                  onChange={handleSettingsChange}
                  className="w-full h-2 bg-[var(--surface-strong)] rounded-lg appearance-none cursor-pointer accent-[var(--foreground)]"
                />
                <div className="flex justify-between text-xs text-[var(--muted)] mt-2">
                  <span>1 min</span>
                  <span>15 mins</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-4">
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              disabled={isLoading}
              className="flex-1 py-3 px-4 bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] font-bold rounded-xl hover:bg-[var(--surface-strong)] disabled:opacity-50 transition-all"
            >
              Back
            </button>
          )}

          <button
            onClick={() => (step === 1 ? setStep(2) : handleSubmit())}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-[var(--foreground)] text-[var(--background)] font-bold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-[var(--background)] border-t-transparent rounded-full animate-spin"></span>
                {step === 2 ? "Saving..." : "Next"}
              </span>
            ) : step === 2 ? (
              "Complete Setup"
            ) : (
              "Next"
            )}
          </button>
        </div>

        {/* Skip */}
        {step === 1 && (
          <div className="text-center mt-4">
            <button
              onClick={() => setStep(2)}
              className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors text-sm"
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
