"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface FormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  form?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isPending, setIsPending] = useState(false);

  function validateEmail(value: string): string | undefined {
    if (!value.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
      return "Enter a valid email address";
  }

  function validatePassword(value: string): string | undefined {
    if (!value) return "Password is required";
    if (value.length < 8) return "Password must be at least 8 characters";
  }

  function validateConfirmPassword(value: string): string | undefined {
    if (!value) return "Please confirm your password";
    if (value !== password) return "Passwords do not match";
  }

  function handleEmailBlur() {
    setErrors((prev) => ({ ...prev, email: validateEmail(email) }));
  }

  function handlePasswordBlur() {
    setErrors((prev) => ({ ...prev, password: validatePassword(password) }));
  }

  function handleConfirmBlur() {
    setErrors((prev) => ({
      ...prev,
      confirmPassword: validateConfirmPassword(confirmPassword),
    }));
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    if (errors.email !== undefined)
      setErrors((prev) => ({ ...prev, email: validateEmail(value) }));
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (errors.password !== undefined)
      setErrors((prev) => ({ ...prev, password: validatePassword(value) }));
    // Re-validate confirm if it's been touched
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
        confirmPassword: validateConfirmPassword(value),
      }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const confirmError = validateConfirmPassword(confirmPassword);
    if (emailError ?? passwordError ?? confirmError) {
      setErrors({
        email: emailError,
        password: passwordError,
        confirmPassword: confirmError,
      });
      return;
    }

    setIsPending(true);
    setErrors({});

    try {
      // Step 1: Create account
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      if (!res.ok) {
        const body = (await res.json()) as {
          error?: { code?: string; message?: string };
        };
        const code = body.error?.code;
        const message = body.error?.message ?? "Registration failed";

        if (code === "EMAIL_ALREADY_EXISTS") {
          setErrors({ email: message });
        } else {
          setErrors({ form: message });
        }
        return;
      }

      // Step 2: Auto sign-in after successful registration
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (result?.error) {
        // Shouldn't happen right after registration, but handle gracefully.
        // Don't navigate — let the user see the message and use the "Sign in" link below.
        setErrors({ form: "Account created. Please sign in." });
        return;
      }

      router.push("/dashboard");
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
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-stone-900">
            Create account
          </h1>
          <p className="text-sm text-stone-500">
            Enter your email and choose a password.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {errors.form && (
            <p className="text-sm text-red-600" role="alert">
              {errors.form}
            </p>
          )}

          {/* Email */}
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
              aria-describedby={errors.email ? "reg-email-error" : undefined}
              aria-invalid={!!errors.email}
              disabled={isPending}
            />
            {errors.email && (
              <p
                id="reg-email-error"
                className="text-xs text-red-600"
                role="alert"
              >
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label
              htmlFor="reg-password"
              className="text-sm font-medium text-stone-700"
            >
              Password
            </label>
            <div className="relative">
              <Input
                id="reg-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onBlur={handlePasswordBlur}
                aria-describedby={
                  errors.password ? "reg-password-error" : undefined
                }
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
              <p
                id="reg-password-error"
                className="text-xs text-red-600"
                role="alert"
              >
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
                  showConfirm ? "Hide confirm password" : "Show confirm password"
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
              "Create account"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-stone-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-stone-900 underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
