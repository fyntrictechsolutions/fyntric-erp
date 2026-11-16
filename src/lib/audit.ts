import {
  addDoc,
  collection,
  deleteDoc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type CollectionReference,
  type DocumentReference,
  type SetOptions,
} from "firebase/firestore";
import { db, firebaseAuth } from "@/lib/firebase";
import type { UserProfile } from "@/types";

/**
 * Activity log. Every sign-in, sign-out and change to data writes one entry to `logs`.
 * Entries are written by the browser (the free Firebase plan has no server code), and the
 * security rules only let people add entries stamped with their own account, never edit or delete them.
 */

export type LogAction = "login" | "logout" | "session" | "create" | "update" | "delete";

export interface Change {
  field: string;
  from: string | null;
  to: string | null;
}

export interface LogEntry {
  id: string;
  action: LogAction;
  module: string | null;
  recordId: string | null;
  recordLabel: string | null;
  changes: Change[];
  note: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  ip: string | null;
  location: string | null;
  device: string;
  path: string;
  at: { toMillis: () => number } | null;
}

let actor: UserProfile | null = null;

/** Called by the auth provider whenever the signed-in profile changes. */
export function setAuditActor(profile: UserProfile | null) {
  actor = profile;
}

interface ClientInfo {
  ip: string | null;
  location: string | null;
}
let clientInfo: Promise<ClientInfo> | null = null;

/** IP address and rough location, as Vercel sees the request. Asked once per page load. */
function getClientInfo(): Promise<ClientInfo> {
  clientInfo ??= fetch("/api/whoami", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<ClientInfo>) : { ip: null, location: null }))
    .catch(() => ({ ip: null, location: null }));
  return clientInfo;
}

/** "Chrome on Windows" from the browser's user agent. */
export function deviceName(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "unknown OS";
  return `${browser} on ${os}`;
}

// ---------- Changes ----------

/** Fields not worth logging: bookkeeping, or too big (file contents). */
const SKIP = new Set(["updatedAt", "createdAt", "createdBy", "data", "id"]);
const MAX_CHANGES = 40;
const MAX_TEXT = 160;

function show(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  let text: string;
  if (typeof value === "object") {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else text = String(value);
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

/** Field-by-field differences between two versions of a record. */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): Change[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: Change[] = [];
  for (const field of [...keys].sort()) {
    if (SKIP.has(field)) continue;
    const from = show(before?.[field]);
    const to = show(after?.[field]);
    if (from !== to) out.push({ field, from, to });
  }
  return out.slice(0, MAX_CHANGES);
}

const LABEL_FIELDS = ["invoiceNumber", "estimateNumber", "receiptNumber", "billNumber", "fullName", "name", "title", "employeeName", "email", "description", "leaveType", "category", "date"];

/** A human name for a record, e.g. its invoice number or person's name. */
export function labelOf(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  for (const f of LABEL_FIELDS) if (data[f]) return show(data[f]);
  return null;
}

// ---------- Writing entries ----------

interface EventInput {
  action: LogAction;
  module?: string | null;
  recordId?: string | null;
  recordLabel?: string | null;
  changes?: Change[];
  note?: string | null;
}

/** Writes one log entry. Never throws: a failed log must not break the action itself. */
export async function logEvent(e: EventInput): Promise<void> {
  try {
    const user = firebaseAuth().currentUser;
    if (!user) return;
    const info = await getClientInfo();
    await addDoc(collection(db(), "logs"), {
      action: e.action,
      module: e.module ?? null,
      recordId: e.recordId ?? null,
      recordLabel: e.recordLabel ?? null,
      changes: e.changes ?? [],
      note: e.note ?? null,
      userId: user.uid,
      userName: actor?.id === user.uid ? actor.displayName : (user.displayName ?? ""),
      userEmail: (actor?.id === user.uid ? actor.email : null) ?? user.email ?? "",
      role: actor?.id === user.uid ? actor.role : "",
      ip: info.ip,
      location: info.location,
      device: deviceName(),
      path: typeof location === "undefined" ? "" : location.pathname + location.search,
      at: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Activity log entry not saved", err);
  }
}

async function before(ref: DocumentReference): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** addDoc, then log the new record. */
export async function loggedAdd(ref: CollectionReference, data: Record<string, unknown>, note?: string) {
  const created = await addDoc(ref, data);
  void logEvent({ action: "create", module: ref.id, recordId: created.id, recordLabel: labelOf(data), changes: diff(null, data), note });
  return created;
}

/** updateDoc, then log what changed. */
export async function loggedUpdate(ref: DocumentReference, data: Record<string, unknown>, note?: string) {
  const old = await before(ref);
  await updateDoc(ref, data);
  const next = { ...(old ?? {}), ...data };
  void logEvent({ action: "update", module: ref.parent.id, recordId: ref.id, recordLabel: labelOf(next), changes: diff(old, next), note });
}

/** setDoc (create, replace or merge), then log it. */
export async function loggedSet(ref: DocumentReference, data: Record<string, unknown>, options?: SetOptions, note?: string) {
  const old = await before(ref);
  await (options ? setDoc(ref, data, options) : setDoc(ref, data));
  const next = options && "merge" in options && options.merge ? { ...(old ?? {}), ...data } : data;
  void logEvent({ action: old ? "update" : "create", module: ref.parent.id, recordId: ref.id, recordLabel: labelOf(next), changes: diff(old, next), note });
}

/** deleteDoc, then log what was removed. */
export async function loggedDelete(ref: DocumentReference, note?: string) {
  const old = await before(ref);
  await deleteDoc(ref);
  void logEvent({ action: "delete", module: ref.parent.id, recordId: ref.id, recordLabel: labelOf(old), changes: diff(old, null), note });
}

// ---------- Sign-in ----------

const SESSION_KEY = "fyntric-log-session";
const METHOD_KEY = "fyntric-log-method";

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** The login form calls this after a successful sign-in; the entry is written once the profile has loaded. */
export function markSignedIn(method: string) {
  const s = storage();
  try {
    s?.setItem(METHOD_KEY, method);
    s?.removeItem(SESSION_KEY);
  } catch {
    /* private mode: the sign-in is logged as a session instead */
  }
}

let sessionLogged = false;

/** After signing out, the next sign-in in this tab is logged again. */
export function endSession() {
  sessionLogged = false;
  try {
    storage()?.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Once per browser tab session: a "login" entry right after signing in, or a "session" entry when
 * someone comes back already signed in (so every visit shows who used the app, and from where).
 */
export function logSessionStart() {
  if (sessionLogged) return;
  sessionLogged = true;
  const s = storage();
  let method: string | null = null;
  try {
    if (s?.getItem(SESSION_KEY) === actor?.id) return;
    method = s?.getItem(METHOD_KEY) ?? null;
    s?.setItem(SESSION_KEY, actor?.id ?? "");
    s?.removeItem(METHOD_KEY);
  } catch {
    /* ignore */
  }
  void logEvent(method ? { action: "login", note: `Signed in with ${method}` } : { action: "session", note: "Opened the app (already signed in)" });
}
