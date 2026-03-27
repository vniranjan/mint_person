import { Suspense } from "react";
import ResetPasswordForm from "./ResetPasswordForm";

// Suspense is required because ResetPasswordForm uses useSearchParams().
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
