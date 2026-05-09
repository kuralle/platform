import { Alert, AlertDescription } from "@kuralle/ui/components/alert";
import { Button } from "@kuralle/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { Separator } from "@kuralle/ui/components/separator";
import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { Wordmark } from "@/components/shell/wordmark";
import { authClient } from "@/lib/auth-client";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth/sign-in")({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    // Already-signed-in users skip the form.
    const s = await authClient.getSession();
    if (s.data) {
      throw new Response(null, { status: 302, headers: { Location: "/home" } });
    }
  },
  component: SignInScreen,
});

function SignInScreen() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTarget = search.redirect ?? "/home";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: name || email.split("@")[0]! });
      if (res.error) {
        setError(res.error.message ?? `Could not ${mode === "sign-in" ? "sign in" : "sign up"}`);
        return;
      }
      // Hard reload so the route guard re-runs and loads the freshly-signed-in
      // session into all the queries that depend on activeOrganizationId.
      // First-run welcome is detected on /home from `user.createdAt` — no URL
      // flag needed. Sign-in honors ?redirect=; sign-up always lands on /home.
      window.location.href = mode === "sign-up" ? "/home" : redirectTarget;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected auth error");
    } finally {
      setSubmitting(false);
    }
  }

  void navigate;

  return (
    <div className="grid min-h-svh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Wordmark className="text-[20px]" />
          <p className="text-center text-[13px] text-muted-foreground">
            Operator-grade voice AI + unified inbox.
            <br />
            {mode === "sign-in" ? "Sign in to your workspace." : "Create an account to get started."}
          </p>
        </div>

        <div className="rounded-[14px] border bg-card p-6 shadow-[0_18px_48px_rgba(11,18,32,0.06)]">
          <h1 className="mb-1 font-display text-[20px] font-semibold tracking-tight">
            {mode === "sign-in" ? "Sign in to Kuralle" : "Create your Kuralle workspace"}
          </h1>
          <p className="mb-6 text-[13px] text-muted-foreground">
            {mode === "sign-in"
              ? "Use the email + password you registered with."
              : "Email + password creates a personal workspace you can rename later."}
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="grid gap-3" data-testid="auth-form">
            {mode === "sign-up" && (
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11"
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="email">Work email</FieldLabel>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                required
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                placeholder="••••••••"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
              <FieldDescription>Minimum 8 characters.</FieldDescription>
            </Field>
            <Button
              type="submit"
              className="h-11 gap-2"
              disabled={!email || !password || submitting}
              data-testid="auth-submit"
            >
              {submitting ? (
                "Working…"
              ) : mode === "sign-in" ? (
                <>Sign in <ArrowRight size={16} /></>
              ) : (
                <>Create workspace <ArrowRight size={16} /></>
              )}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {mode === "sign-in" ? "or" : "already have an account?"}
            </span>
            <Separator className="flex-1" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={() => {
              setError(null);
              setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"));
            }}
            data-testid="auth-toggle"
          >
            {mode === "sign-in" ? "Create a new workspace instead" : "Back to sign in"}
          </Button>
        </div>

        <p className="mt-6 text-center text-[12px] text-muted-foreground">
          Closed testing — legal terms are not published yet.
        </p>
      </div>
    </div>
  );
}
