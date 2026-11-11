"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { siteConfig } from "@/config/site";
import { firebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "./AuthProvider";

type Mode = "signin" | "signup" | "reset";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/user-not-found": "No account with that email.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/weak-password": "Use at least 6 characters for the password.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
};

function authMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  return MESSAGES[code] ?? (e instanceof Error ? e.message : "Something went wrong.");
}

export function LoginForm() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const auth = firebaseAuth();
    if (mode === "signin") void run(() => signInWithEmailAndPassword(auth, email, password));
    if (mode === "signup")
      void run(async () => {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
      });
    if (mode === "reset")
      void run(async () => {
        await sendPasswordResetEmail(auth, email);
        setNotice("Check your inbox for a link to reset your password.");
      });
  };

  const google = () => void run(() => signInWithPopup(firebaseAuth(), new GoogleAuthProvider()));

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -top-32 -left-32 size-[28rem] rounded-full bg-brand-600/40 blur-[120px]" />
        <div aria-hidden className="absolute -right-24 bottom-0 size-[24rem] rounded-full bg-accent-violet/30 blur-[120px]" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "48px 48px" }}
        />
        <div className="relative">
          <span className="inline-block rounded-xl bg-white px-4 py-2.5"><Logo className="[&_img]:h-7" /></span>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-4xl leading-tight font-semibold">One place for your team, clients, projects and money.</h1>
          <p className="mt-4 text-white/70">HR, CRM, project delivery and finance for {siteConfig.company}.</p>
        </div>
        <p className="relative text-sm text-white/50">© {siteConfig.company}</p>
      </div>

      {/* Form */}
      <div className="flex flex-col bg-background px-4 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <span className="lg:hidden"><Logo /></span>
          <span className="hidden lg:block" />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h2 className="font-display text-2xl font-semibold text-foreground">
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset password"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {mode === "signup" ? "New accounts get access once an admin assigns a role." : `Welcome to ${siteConfig.name}.`}
          </p>

          {!isFirebaseConfigured && (
            <p className="mt-6 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Firebase isn&apos;t configured. Add the NEXT_PUBLIC_FIREBASE_* environment variables (see README).
            </p>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label htmlFor="name" className={labelClasses}>Full name</label>
                <input id="name" className={inputClasses} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </div>
            )}
            <div>
              <label htmlFor="email" className={labelClasses}>Email</label>
              <input id="email" type="email" className={inputClasses} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            {mode !== "reset" && (
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className={labelClasses}>Password</label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => setMode("reset")} className="mb-1.5 text-xs font-medium text-accent hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  id="password"
                  type="password"
                  className={inputClasses}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>
            )}

            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
            {notice && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}

            <Button type="submit" className="w-full" disabled={busy || !isFirebaseConfigured}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
          </form>

          {mode !== "reset" && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-subtle">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>
              <Button variant="secondary" className="w-full" onClick={google} disabled={busy || !isFirebaseConfigured}>
                <GoogleIcon /> Continue with Google
              </Button>
            </>
          )}

          <p className="mt-8 text-center text-sm text-muted">
            {mode === "signin" ? (
              <>New here? <button type="button" className="font-medium text-accent hover:underline" onClick={() => setMode("signup")}>Create an account</button></>
            ) : (
              <>Have an account? <button type="button" className="font-medium text-accent hover:underline" onClick={() => setMode("signin")}>Sign in</button></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}
