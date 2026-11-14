"use client";

import { collection, doc, onSnapshot, query, where, type Query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useEffect, useMemo, useState } from "react";
import { canRead, type ModuleKey } from "@/config/roles";
import { scopedQuery } from "@/lib/records";
import type { BaseRecord, UserProfile } from "@/types";

interface CollectionState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

/**
 * Live list of records for a Firestore query, newest first.
 * Pass a stable key (e.g. module + user id) so the subscription only restarts when it changes.
 */
export function useLiveQuery<T extends BaseRecord = BaseRecord>(
  buildQuery: () => Query | null,
  key: string,
): CollectionState<T> {
  // buildQuery is intentionally keyed by `key` instead of identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const q = useMemo(() => buildQuery(), [key]);
  const [result, setResult] = useState<{ key: string; data: T[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!q) return;
    return onSnapshot(
      q,
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as T)
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setResult({ key, data, error: null });
      },
      (err) => setResult({ key, data: [], error: err.message }),
    );
  }, [q, key]);

  if (!q) return { data: [], loading: false, error: null };
  if (!result || result.key !== key) return { data: [], loading: true, error: null };
  return { data: result.data, loading: false, error: result.error };
}

/** Live records of a module that the signed-in user is allowed to see (empty if none). */
export function useModuleRecords<T extends BaseRecord = BaseRecord>(module: ModuleKey, profile: UserProfile, ownOnly = false) {
  const allowed = canRead(profile.role, module);
  return {
    allowed,
    ...useLiveQuery<T>(
      () => (allowed ? scopedQuery(module, profile, ownOnly) : null),
      `${module}:${profile.id}:${profile.role}:${profile.clientId ?? ""}:${ownOnly}`,
    ),
  };
}

/** Live records of a module matching one field (e.g. follow-ups of a lead). Caller must have read access to all. */
export function useRecordsWhere<T extends BaseRecord = BaseRecord>(module: ModuleKey | "files" | "users", field: string, value: string | undefined | null) {
  return useLiveQuery<T>(
    () => (value ? query(collection(db(), module), where(field, "==", value)) : null),
    `${module}:${field}:${value ?? ""}`,
  );
}

/** One live record by id. */
export function useRecord<T extends BaseRecord = BaseRecord>(module: ModuleKey | "users" | "files", id: string | null | undefined) {
  const [state, setState] = useState<{ id: string; data: T | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db(), module, id),
      (snap) => setState({ id, data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null, error: null }),
      (err) => setState({ id, data: null, error: err.message }),
    );
  }, [module, id]);
  if (!id) return { data: null, loading: false, error: null };
  if (!state || state.id !== id) return { data: null, loading: true, error: null };
  return { data: state.data, loading: false, error: state.error };
}
