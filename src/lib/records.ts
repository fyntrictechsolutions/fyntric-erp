import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  query,
  updateDoc,
  where,
  type Query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { permissionFor, type ModuleKey } from "@/config/roles";
import type { BaseRecord, UserProfile } from "@/types";

/** Firestore collection name for each module (kept equal to the module key). */
export function collectionName(module: ModuleKey): string {
  return module;
}

/**
 * The query a user is allowed to run for a module. Staff with "own" access
 * only ask for their records, clients only for records linked to them.
 * Firestore rules reject any query that could return more than that.
 */
export function scopedQuery(module: ModuleKey, profile: UserProfile): Query | null {
  const { read } = permissionFor(profile.role, module);
  const ref = collection(db(), collectionName(module));
  if (read === "all") return ref;
  if (read === "own") return query(ref, where("userId", "==", profile.id));
  if (read === "client") return profile.clientId ? query(ref, where("clientId", "==", profile.clientId)) : null;
  return null;
}

/** Drops undefined values, which Firestore refuses to store. */
function clean<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as T;
}

export async function createRecord(module: ModuleKey, data: Record<string, unknown>, profile: UserProfile) {
  const now = Date.now();
  return addDoc(
    collection(db(), collectionName(module)),
    clean({
      ...data,
      userId: profile.id,
      userName: profile.displayName,
      createdBy: profile.id,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

export async function updateRecord(module: ModuleKey, id: string, data: Record<string, unknown>) {
  const { id: _id, createdAt, createdBy, userId, userName, ...rest } = data as BaseRecord;
  void _id; void createdAt; void createdBy; void userId; void userName;
  return updateDoc(doc(db(), collectionName(module), id), clean({ ...rest, updatedAt: Date.now() }));
}

export async function deleteRecord(module: ModuleKey, id: string) {
  return deleteDoc(doc(db(), collectionName(module), id));
}
