import { Suspense } from "react";
import LoginForm from "./LoginForm";

// Suspense is required because LoginForm uses useSearchParams()
// (reading ?reset=success after password reset).
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
