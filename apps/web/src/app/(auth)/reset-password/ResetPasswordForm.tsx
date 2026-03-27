"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface FormErrors {
  password?: string;
  confirmPassword?: string;
  form?: string;
}

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isPending, setIsPending] = useState(false);

  // No token in URL — show expired/invalid error immediately.
  if (!token) {
    return <ExpiredError />;
  }

  function validatePassword(value: string): string | undefined {
    if (!value) return "Password is required";
    if (value.length < 8) return "Password must be at least 8 characters";
    if (value.length > 128) return "Password must be 128 characters or fewer";
  }

  function validateConfirm(value: string): string | undefined {
    if (!value) return "Please confirm your password";
    if (value !== password) return "Passwords do not match";
  }

  function handlePasswordBlur() {
    setErrors((prev) => ({ ...prev, password: validatePassword(password) }));
  }

  function handleConfirmBlur() {
    setErrors((prev) => ({
      ...prev,
      confirmPassword: validateConfirm(confirmPassword),
    }));
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (errors.password !== undefined)
      setErrors((prev) => ({ ...prev, password: validatePassword(value) }));
    if (errors.confirmPassword !== undefined)
      setErrors((prev) => ({
        ...prev,
        confirmPassword:
          confirmPassword !== value ? "Passwords do not match" : undefined,
      }));
  }

  function handleConfirmChange(value: string) {
    setConfirmPassword(value);
    if (errors.confirmPassword !== undefined)
      setErrors((prev) => ({
        ...prev,
        confirmPassword: validateConfirm(value),
      }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const pwErr = validatePassword(password);
    const cfErr = validateConfirm(confirmPassword);
    if (pwErr ?? cfErr) {
      setErrors({ password: pwErr, confirmPassword: cfErr });
      return;
    }

    setIsPending(true);
    setErrors({});

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const body = (await res.json()) as {
          error?: { code?: string; message?: string };
        };
        if (body.error?.code === "INVALID_OR_EXPIRED_TOKEN") {
          setErrors({ form: "expired" });
          return;
        }
        setErrors({ form: body.error?.message ?? "Password reset failed" });
        return;
      }

      router.push("/login?reset=success");
    } catch {
      setErrors({ form: "Unable to connect. Please try again." });
    } finally {
      setIsPending(false);
    }
  }

  if (errors.form === "expired") {
    return <ExpiredError />;
  }

  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-stone-50"
    >
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-stone-900">
            Set new password
          </h1>
          <p className="text-sm text-stone-500">
            Choose a new password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {errors.form && errors.form !== "expired" && (
            <p className="text-sm text-red-600" role="alert">
              {errors.form}
            </p>
          )}

          {/* Password */}
          <div className="space-y-1">
            <label
              htmlFor="new-password"
              className="text-sm font-medium text-stone-700"
            >
              New password
            </label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onBlur={handlePasswordBlur}
                aria-describedby={errors.password ? "pw-error" : undefined}
                aria-invalid={!!errors.password}
                disabled={isPending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <p id="pw-error" className="text-xs text-red-600" role="alert">
                {errors.password}
              </p>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1">
            <label
              htmlFor="confirm-password"
              className="text-sm font-medium text-stone-700"
            >
              Confirm password
            </label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => handleConfirmChange(e.target.value)}
                onBlur={handleConfirmBlur}
                aria-describedby={
                  errors.confirmPassword ? "confirm-error" : undefined
                }
                aria-invalid={!!errors.confirmPassword}
                disabled={isPending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
                aria-label={
                  showConfirm
                    ? "Hide confirm password"
                    : "Show confirm password"
                }
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p
                id="confirm-error"
                className="text-xs text-red-600"
                role="alert"
              >
                {errors.confirmPassword}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Set new password"
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}

function ExpiredError() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-stone-50"
    >
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-stone-900">Link expired</h1>
        <p className="text-sm text-stone-600">
          This reset link has expired or already been used.
        </p>
        <Link
          href="/forgot-password"
          className="block text-sm font-medium text-stone-900 underline-offset-4 hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    </main>
  );
}
