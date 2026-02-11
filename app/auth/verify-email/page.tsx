"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [resendCount, setResendCount] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const canResend = cooldown === 0;

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResend = async () => {
    setResendCount((prev) => prev + 1);
    setCooldown(60); // 60 second cooldown

    // In a real app, you'd call an API to resend the email
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        alert("Failed to resend email. Please try again.");
        setCooldown(0);
      }
    } catch (error) {
      console.error("Error resending email:", error);
      alert("An error occurred. Please try again.");
      setCooldown(0);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-neutral-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {/* Header */}
        <div className="mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-lime-400 to-lime-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-lime-400/20">
            <svg
              className="w-8 h-8 text-black"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Verify your email</h1>
          <p className="text-neutral-400">
            We&apos;ve sent a magic link to <strong className="text-white">{email}</strong>
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-6 text-left space-y-4">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-lime-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-lime-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-1">Check your inbox</h3>
              <p className="text-neutral-400 text-sm">
                Look for an email from Chronoread with a sign in link
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-lime-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-lime-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-1">Click the link</h3>
              <p className="text-neutral-400 text-sm">
                Click any link in the email to sign in to your account
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-lime-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-lime-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-1">Set up your profile</h3>
              <p className="text-neutral-400 text-sm">
                Complete your profile and narration preferences
              </p>
            </div>
          </div>
        </div>

        {/* Resend */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-6">
          <p className="text-neutral-400 text-sm mb-4">Didn&apos;t receive the email?</p>
          <button
            onClick={handleResend}
            disabled={!canResend}
            className={`w-full py-3 px-4 rounded-xl font-medium transition-all ${
              canResend
                ? "bg-lime-400/10 border border-lime-400/50 text-lime-400 hover:bg-lime-400/20"
                : "bg-neutral-800 border border-neutral-700 text-neutral-500 cursor-not-allowed"
            }`}
          >
            {canResend ? (
              "Resend verification email"
            ) : cooldown > 0 ? (
              `Resend in ${cooldown}s`
            ) : (
              "Resend verification email"
            )}
          </button>
          {resendCount > 0 && (
            <p className="text-xs text-neutral-500 mt-3">
              You&apos;ve requested {resendCount} resend{resendCount > 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Change Email */}
        <div className="text-center">
          <p className="text-neutral-400 text-sm mb-4">
            Wrong email address?
          </p>
          <Link
            href="/auth/signup"
            className="inline-block py-2 px-4 bg-neutral-800 border border-neutral-700 text-white rounded-lg hover:bg-neutral-700 transition-colors font-medium"
          >
            Create new account
          </Link>
        </div>

        {/* Support */}
        <div className="mt-8 pt-8 border-t border-neutral-800">
          <p className="text-xs text-neutral-600">
            Still having issues?{" "}
            <a
              href="mailto:support@chronoread.com"
              className="text-lime-400 hover:text-lime-300 transition-colors"
            >
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmail() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-black via-neutral-900 to-black flex items-center justify-center p-4">
          <div className="text-neutral-500 text-sm uppercase tracking-widest">Loading</div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
