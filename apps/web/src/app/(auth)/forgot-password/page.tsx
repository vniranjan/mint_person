"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [sent, setSent] = useState(false);

  function validateEmail(value: string): string | undefined {
    if (!value.trim()) return "Email is required";
    if (!EMAIL_REGEX.test(value.trim())) return "Enter a valid email address";
  }

  function handleEmailBlur() {
    setEmailError(validateEmail(email));
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    if (emailError !== undefined) setEmailError(validateEmail(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const err = validateEmail(email);
    if (err) {
      setEmailError(err);
      return;
    }

    setIsPending(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      // Always show success — no email enumeration regardless of API result.
      setSent(true);
    } catch {
      // Network error — still show success to avoid enumeration.
      setSent(true);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-stone-50"
    >
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        {sent ? (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold text-stone-900">
              Check your email
            </h1>
            <p className="text-sm text-stone-600">
              If that email is registered, a reset link has been sent. Check
              your inbox (and spam folder).
            </p>
            <Link
              href="/login"
              className="block text-sm font-medium text-stone-900 underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold text-stone-900">
                Forgot password?
              </h1>
              <p className="text-sm text-stone-500">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-stone-700"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={handleEmailBlur}
                  aria-describedby={emailError ? "email-error" : undefined}
                  aria-invalid={!!emailError}
                  disabled={isPending}
                />
                {emailError && (
                  <p
                    id="email-error"
                    className="text-xs text-red-600"
                    role="alert"
                  >
                    {emailError}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-stone-500">
              <Link
                href="/login"
                className="font-medium text-stone-900 underline-offset-4 hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
