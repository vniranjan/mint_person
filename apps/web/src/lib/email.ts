import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  console.warn(
    "[email] RESEND_API_KEY is not set — password reset emails will fail silently",
  );
}

// Singleton — instantiated once at module load.
const resend = new Resend(process.env.RESEND_API_KEY ?? "");

const FROM = process.env.RESEND_FROM_EMAIL ?? "mint <noreply@example.com>";

export async function sendPasswordResetEmail(
  to: string,
  rawToken: string,
): Promise<void> {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your mint password",
    html: `
      <p>You requested a password reset for your mint account.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      <p>Or copy this URL into your browser:<br>${resetUrl}</p>
    `,
  });
}
