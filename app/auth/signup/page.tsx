"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function SignUp() {
  const router = useRouter();
  const isGoogleEnabled = process.env.NODE_ENV !== "production";
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Create account via signup API
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to create account");
        setIsLoading(false);
        return;
      }

      setSuccess(true);

      // Auto sign in after account creation
      setTimeout(async () => {
        const result = await signIn("credentials", {
          email: formData.email,
          password: formData.password,
          redirect: false,
        });

        if (result?.ok) {
          router.push("/auth/setup-profile");
        } else {
          setError("Account created but sign-in failed. Please sign in from the login page.");
          setIsLoading(false);
        }
      }, 1500);
    } catch (error) {
      setError("An error occurred. Please try again.");
      console.error("Sign up error:", error);
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    try {
      await signIn("google", {
        callbackUrl: "/auth/setup-profile",
      });
    } catch (error) {
      setError("Failed to sign up with Google");
      console.error("Google sign up error:", error);
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-[var(--foreground)] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-[var(--shadow)]">
            <svg className="w-8 h-8 text-[var(--background)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Account Created!</h1>
          <p className="text-[var(--muted)] mb-6">
            Welcome <strong>{formData.name || formData.email}</strong>
          </p>
          <p className="text-sm text-[var(--muted)]">
            Signing you in and taking you to your profile setup...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[var(--foreground)] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-[var(--shadow)]">
            <span className="text-2xl font-bold text-[var(--background)]">N</span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Join Chronoread</h1>
          <p className="text-[var(--muted)]">
            Create your neural narrative account
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-[var(--foreground)] text-sm">{error}</p>
          </div>
        )}

        {/* Sign Up Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
              Full Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your name"
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
              Email Address
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
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
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="At least 8 characters"
              required
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
              disabled={isLoading}
            />
            <p className="text-xs text-[var(--muted)] mt-1">
              Must be at least 8 characters long
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              required
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted-strong)] mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              required
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--muted-strong)] transition-colors"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !formData.email || !formData.password}
            className="w-full py-3 px-4 bg-[var(--foreground)] text-[var(--background)] font-bold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 active:scale-95"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-[var(--background)] border-t-transparent rounded-full animate-spin"></span>
                Creating account...
              </span>
            ) : (
              "Create Account"
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
                <span className="px-2 bg-[var(--background)] text-[var(--muted)]">Or sign up with</span>
              </div>
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-3 mb-6">
              <button
                onClick={handleGoogleSignUp}
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
                Sign up with Google
              </button>
            </div>
          </>
        )}

        {/* Sign In Link */}
        <div className="text-center">
          <p className="text-[var(--muted)] text-sm">
            Already have an account?{" "}
            <Link
              href="/auth/signin"
              className="text-[var(--foreground)] underline underline-offset-4 font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Help Text */}
        <div className="mt-8 pt-8 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted)] text-center mb-3">
            By signing up, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
