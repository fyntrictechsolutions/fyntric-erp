"use client";

import { Clock, LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ROLES } from "@/config/roles";
import { siteConfig } from "@/config/site";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "./AuthProvider";

/** Protects the signed-in area: sends visitors to /login and holds new users until an admin gives them a role. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, user, profile, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isFirebaseConfigured && !loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (!isFirebaseConfigured) return <SetupNeeded />;
  if (loading || !user || !profile) return <FullPageSpinner />;

  if (profile.role === "pending" || !profile.active) {
    const pending = profile.role === "pending";
    return (
      <CenteredMessage
        icon={<Clock className="size-6" />}
        title={pending ? "Waiting for access" : "Account disabled"}
        body={
          profile.invalidRole !== undefined
            ? `Your role is set to "${profile.invalidRole}", which isn't a role Fyntric ERP knows. In Firestore > users, set role to exactly one of: ${ROLES.join(", ")} (lowercase).`
            : pending
            ? `You're signed in as ${profile.email}. An admin needs to give you a role before you can use ${siteConfig.name}. This page will update by itself once that's done.`
            : `Your account has been turned off. Contact ${siteConfig.supportEmail} if you think this is a mistake.`
        }
        action={<Button variant="secondary" onClick={() => void signOut()}><LogOut className="size-4" /> Sign out</Button>}
      />
    );
  }

  return <AppShell>{children}</AppShell>;
}

function SetupNeeded() {
  return (
    <CenteredMessage
      icon={<Settings className="size-6" />}
      title="Firebase isn't connected yet"
      body="Add the NEXT_PUBLIC_FIREBASE_* values from your Firebase project to .env.local (or to Vercel's environment variables) and restart. The README explains each step."
    />
  );
}

export function CenteredMessage({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <Logo className="mx-auto mb-6" />
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</span>
        <h1 className="mt-4 font-display text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted">{body}</p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </Card>
    </div>
  );
}
