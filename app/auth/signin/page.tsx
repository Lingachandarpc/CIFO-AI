"use client";

import React, { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const error = searchParams.get("error");
  const isGoogleEnabled = process.env.NODE_ENV !== "production";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(error || null);

  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSignInError(null);

    try {
      // Let NextAuth handle the redirect so cookies/session are set by the server.
      await signIn("credentials", {
        email,
        password,
        callbackUrl,
      });
    } catch (error) {
      setSignInError("An error occurred. Please try again.");
      console.error("Sign in error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("google", {
        callbackUrl,
      });
    } catch (error) {
      setSignInError("Failed to sign in with Google");
      console.error("Google sign in error:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[var(--foreground)] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-[var(--shadow)]">
            <span className="text-2xl font-bold text-[var(--background)]">S</span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Self \ Fles</h1>
          <p className="text-[var(--muted)]">Self companion AI app.</p>
        </div>

        {/* Error Message */}
        {signInError && (
          <div className="mb-6 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-[var(--foreground)] text-sm">{signInError}</p>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleCredentialsSignIn} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full py-3 px-4 bg-[var(--foreground)] text-[var(--background)] font-bold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 active:scale-95"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-[var(--background)] border-t-transparent rounded-full animate-spin"></span>
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {isGoogleEnabled && (
          <>
            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-[var(--background)] text-[var(--muted)]">Or continue with</span>
              </div>
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-3 mb-6">
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] font-medium rounded-xl hover:bg-[var(--surface-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  <path fill="none" d="M1 1h22v22H1z" />
                </svg>
                Continue with Google
              </button>
            </div>
          </>
        )}

        {/* Sign Up Link */}
        <div className="text-center">
          <p className="text-[var(--muted)] text-sm">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/signup"
              className="text-[var(--foreground)] underline underline-offset-4 font-medium transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>

        {/* Help Text */}
        <div className="mt-8 pt-8 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted)] text-center mb-3">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
          <p className="text-xs text-[var(--muted)] text-center">
            Having trouble?{" "}
            <a
              href="mailto:support@chronoread.com"
              className="text-[var(--foreground)] underline underline-offset-4 transition-colors"
            >
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
          <div className="text-[var(--muted)] text-sm uppercase tracking-widest">Loading</div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
