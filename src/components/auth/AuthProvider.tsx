"use client";

import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
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
        // First sign-in: register as "pending" until an admin assigns a role.
        const now = Date.now();
        void setDoc(ref, {
          email: user.email ?? "",
          displayName: user.displayName || user.email?.split("@")[0] || "New user",
          photoURL: user.photoURL ?? null,
          role: "pending",
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      },
      () => setLoading(false),
    );
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({ loading, user, profile, signOut: () => firebaseSignOut(firebaseAuth()) }),
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
