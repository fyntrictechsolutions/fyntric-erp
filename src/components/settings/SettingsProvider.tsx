"use client";

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_APP,
  DEFAULT_BUSINESS,
  DEFAULT_LISTS,
  DEFAULT_OFFER,
  type AppSettings,
  type OfferSettings,
  type BusinessSettings,
  type ListSettings,
} from "@/config/settingsDefaults";
import { db } from "@/lib/firebase";

export interface Settings {
  business: BusinessSettings;
  lists: ListSettings;
  app: AppSettings;
  offer: OfferSettings;
}

export type SettingsSection = keyof Settings;

const DEFAULTS: Settings = { business: DEFAULT_BUSINESS, lists: DEFAULT_LISTS, app: DEFAULT_APP, offer: DEFAULT_OFFER };
const SettingsContext = createContext<Settings>(DEFAULTS);

/** Live company settings for everyone signed in, falling back to the defaults. */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<Partial<Record<SettingsSection, object>>>({});

  useEffect(() => {
    const unsubs = (["business", "lists", "app", "offer"] as const).map((section) =>
      onSnapshot(
        doc(db(), "settings", section),
        (snap) => setStored((s) => ({ ...s, [section]: snap.exists() ? snap.data() : {} })),
        () => undefined,
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  const value = useMemo<Settings>(
    () => ({
      business: { ...DEFAULT_BUSINESS, ...(stored.business as Partial<BusinessSettings>) },
      lists: { ...DEFAULT_LISTS, ...(stored.lists as Partial<ListSettings>) },
      app: { ...DEFAULT_APP, ...(stored.app as Partial<AppSettings>) },
      offer: { ...DEFAULT_OFFER, ...(stored.offer as Partial<OfferSettings>) },
    }),
    [stored],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  return useContext(SettingsContext);
}

/** Saves part of one settings section (admins only, enforced by the rules). */
export function saveSettings<S extends SettingsSection>(section: S, patch: Partial<Settings[S]>) {
  return setDoc(doc(db(), "settings", section), { ...patch, updatedAt: Date.now() }, { merge: true });
}
