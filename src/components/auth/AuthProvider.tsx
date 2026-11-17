"use client";

import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { deleteDoc, doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { endSession, logEvent, logSessionStart, setAuditActor } from "@/lib/audit";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { db, firebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import type { UserProfile } from "@/types";

interface AuthState {
  /** True until we know whether someone is signed in and have loaded their profile. */
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Creates users/{uid} on first sign-in, taking the role from an invitation when one matches a verified email. */
async function registerProfile(user: User) {
  const now = Date.now();
  const ref = doc(db(), "users", user.uid);
  const base = {
    email: user.email ?? "",
    displayName: user.displayName || user.email?.split("@")[0] || "New user",
    photoURL: user.photoURL ?? null,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  if (user.email && user.emailVerified) {
    try {
      const inviteRef = doc(db(), "invites", user.email.toLowerCase());
      const invite = await getDoc(inviteRef);
      if (invite.exists()) {
        const i = invite.data();
        await setDoc(ref, {
          ...base,
          displayName: user.displayName || i.name || base.displayName,
          role: i.role,
          inviteId: invite.id,
          clientId: i.clientId ?? null,
          clientIdLabel: i.clientIdLabel ?? null,
          employeeId: i.employeeId ?? null,
          employeeIdLabel: i.employeeIdLabel ?? null,
        });
        await deleteDoc(inviteRef).catch(() => undefined);
        return;
      }
    } catch {
      // No readable invitation: fall through to a normal sign-up.
    }
  }
  await setDoc(ref, { ...base, role: "pending" });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  // Track the signed-in Firebase user.
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(firebaseAuth(), (next) => {
      setUser(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
      }
    });
  }, []);

  // Load (or create on first sign-in) the user's profile with their role.
  useEffect(() => {
    if (!user) return;
    const ref = doc(db(), "users", user.uid);
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setProfile({ id: snap.id, ...snap.data() } as UserProfile);
          setLoading(false);
          return;
        }
        // First sign-in: use their invitation if an admin sent one, otherwise wait for approval.
        void registerProfile(user);
      },
      () => setLoading(false),
    );
  }, [user]);

  // The activity log reads who is signed in from here, and records the sign-in once the profile is known.
  useEffect(() => {
    setAuditActor(profile);
    if (profile) logSessionStart();
  }, [profile]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      profile,
      signOut: async () => {
        await logEvent({ action: "logout" });
        endSession();
        await firebaseSignOut(firebaseAuth());
      },
    }),
    [loading, user, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** The signed-in user's profile. Only use inside the signed-in app area, where it is guaranteed. */
export function useProfile(): UserProfile {
  const { profile } = useAuth();
  if (!profile) throw new Error("useProfile used outside the signed-in area");
  return profile;
}
