import { Button } from "@kuralle/ui/components/button";
import { ComplianceChip } from "@kuralle/ui/components/compliance-chip";
import { Field, FieldDescription, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { Separator } from "@kuralle/ui/components/separator";
import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { Wordmark } from "@/components/shell/wordmark";

export const Route = createFileRoute("/auth/sign-in")({
  component: SignInScreen,
});

function SignInScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSso(_provider: "google" | "microsoft" | "apple") {
    setSubmitting(true);
    setTimeout(() => navigate({ to: "/home" }), 300);
  }

  function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setTimeout(() => navigate({ to: "/home" }), 300);
  }

  return (
    <div className="grid min-h-svh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Wordmark className="text-[20px]" />
          <p className="text-center text-[13px] text-mute-slate">
            Operator-grade voice AI + unified inbox.
            <br />
            Sign in to your workspace.
          </p>
        </div>

        <div className="rounded-[14px] border bg-card p-6 shadow-[0_18px_48px_rgba(11,18,32,0.06)]">
          <h1 className="mb-1 font-display text-[20px] font-semibold tracking-tight">Sign in to Kuralle</h1>
          <p className="mb-6 text-[13px] text-mute-slate">SSO is the recommended path for SOC 2 workspaces.</p>

          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 justify-start gap-3 text-[14px]"
              disabled={submitting}
              onClick={() => handleSso("google")}
            >
              <GoogleMark /> Continue with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 justify-start gap-3 text-[14px]"
              disabled={submitting}
              onClick={() => handleSso("microsoft")}
            >
              <MicrosoftMark /> Continue with Microsoft
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 justify-start gap-3 text-[14px]"
              disabled={submitting}
              onClick={() => handleSso("apple")}
            >
              <AppleMark /> Continue with Apple
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mute-slate">
              or magic link
            </span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleEmail} className="grid gap-3">
            <Field>
              <FieldLabel htmlFor="email">Work email</FieldLabel>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="rj@calderonhvac.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
              <FieldDescription>
                We'll send a one-time link. SSO domains skip this step automatically.
              </FieldDescription>
            </Field>
            <Button type="submit" className="h-11 gap-2" disabled={!email || submitting}>
              {submitting ? "Signing you in…" : (
                <>
                  Send magic link <ArrowRight size={16} />
                </>
              )}
            </Button>
          </form>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <ComplianceChip label="SOC 2" state="active" />
          <ComplianceChip label="HIPAA" state="active" suffix="BAA available" />
          <ComplianceChip label="FERPA" state="active" />
          <ComplianceChip label="EU AI Act" state="action-required" />
        </div>

        <p className="mt-6 text-center text-[12px] text-mute-slate">
          By signing in, you agree to our{" "}
          <a className="underline-offset-2 hover:underline" href="#">Terms</a> and{" "}
          <a className="underline-offset-2 hover:underline" href="#">Acceptable Use Policy</a>.
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A8.99 8.99 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" fill="#FBBC05" />
      <path d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58A8.99 8.99 0 0 0 9 0 8.99 8.99 0 0 0 .96 4.96L3.97 7.29C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect width="8" height="8" x="0" y="0" fill="#F25022" />
      <rect width="8" height="8" x="10" y="0" fill="#7FBA00" />
      <rect width="8" height="8" x="0" y="10" fill="#00A4EF" />
      <rect width="8" height="8" x="10" y="10" fill="#FFB900" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="currentColor">
      <path d="M14.94 13.83a8.4 8.4 0 0 1-.84 1.5c-.45.66-.82 1.12-1.1 1.38-.43.41-.9.62-1.4.63-.36 0-.79-.1-1.3-.31a3.7 3.7 0 0 0-1.4-.31c-.5 0-.97.1-1.42.3-.45.21-.81.32-1.1.32-.48.02-.96-.2-1.43-.65-.3-.27-.7-.74-1.16-1.41A9.55 9.55 0 0 1 1.6 12.6a9.6 9.6 0 0 1-.5-3.05c0-1.16.25-2.16.74-3 .39-.68.91-1.21 1.56-1.6.65-.4 1.36-.6 2.13-.6.4 0 .9.12 1.5.34.6.23.99.34 1.16.34.13 0 .57-.13 1.31-.4.7-.24 1.3-.34 1.78-.3 1.34.1 2.34.63 3 1.59-1.2.72-1.79 1.74-1.78 3.04 0 1.02.36 1.86 1.1 2.53.32.3.69.53 1.1.69-.08.25-.18.5-.3.74zM11.2 1.5c0 .87-.32 1.69-.95 2.45-.76.9-1.69 1.41-2.7 1.33a2.83 2.83 0 0 1-.02-.32c0-.83.36-1.71 1-2.46.32-.39.73-.71 1.23-.96.5-.25.97-.39 1.41-.41.02.13.03.26.03.37z" />
    </svg>
  );
}
