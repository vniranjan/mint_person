"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface FormErrors {
  email?: string;
  password?: string;
  form?: string;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";

  // Clear the stale ?reset=success param so it doesn't persist on refresh.
  useEffect(() => {
    if (resetSuccess) {
      router.replace("/login", { scroll: false });
    }
  }, [resetSuccess, router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isPending, setIsPending] = useState(false);

  function validateEmail(value: string): string | undefined {
    if (!value.trim()) return "Email is required";
    if (!value.includes("@")) return "Enter a valid email address";
  }

  function validatePassword(value: string): string | undefined {
    if (!value) return "Password is required";
  }

  function handleEmailBlur() {
    setErrors((prev) => ({ ...prev, email: validateEmail(email) }));
  }

  function handlePasswordBlur() {
    setErrors((prev) => ({ ...prev, password: validatePassword(password) }));
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError ?? passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }

    setIsPending(true);
    setErrors({});

    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (result?.error) {
        // Generic error — never reveal which field is wrong (AC2 Story 1.3)
        setErrors({ form: "Invalid email or password" });
        return;
      }

      router.push("/dashboard");
    } catch {
      setErrors({ form: "Unable to connect. Please try again." });
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
          <h1 className="text-xl font-semibold text-stone-900">Sign in</h1>
          <p className="text-sm text-stone-500">
            Enter your email and password to continue.
          </p>
        </div>

        {/* Password reset success message (AC3 Story 1.4) */}
        {resetSuccess && (
          <p className="text-sm text-emerald-600" role="status">
            Password updated. Please sign in.
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Form-level error */}
          {errors.form && (
            <p className="text-sm text-red-600" role="alert">
              {errors.form}
            </p>
          )}

          {/* Email field */}
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
              aria-describedby={errors.email ? "email-error" : undefined}
              aria-invalid={!!errors.email}
              disabled={isPending}
            />
            {errors.email && (
              <p id="email-error" className="text-xs text-red-600" role="alert">
                {errors.email}
              </p>
            )}
          </div>

          {/* Password field with show/hide toggle */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-sm font-medium text-stone-700"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-stone-500 underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onBlur={handlePasswordBlur}
                aria-describedby={
                  errors.password ? "password-error" : undefined
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
                id="password-error"
                className="text-xs text-red-600"
                role="alert"
              >
                {errors.password}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-stone-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-stone-900 underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
