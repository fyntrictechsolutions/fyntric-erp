"use client";

import { LogOut } from "lucide-react";
import { useAuth, useProfile } from "@/components/auth/AuthProvider";
import { ROLE_LABELS } from "@/config/roles";

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function UserMenu() {
  const profile = useProfile();
  const { signOut } = useAuth();
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium text-foreground">{profile.displayName}</p>
        <p className="text-xs text-muted">{ROLE_LABELS[profile.role]}</p>
      </div>
      <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-violet text-sm font-semibold text-white">
        {initials(profile.displayName)}
      </span>
      <button type="button" onClick={() => void signOut()} className="rounded-lg p-2 text-muted hover:bg-tint-strong hover:text-foreground" aria-label="Sign out" title="Sign out">
        <LogOut className="size-5" />
      </button>
    </div>
  );
}
