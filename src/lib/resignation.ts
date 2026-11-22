import { deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { todayISO } from "@/lib/format";
import type { BaseRecord, UserProfile } from "@/types";

/**
 * Resignations live at exits/{employeeId}, whether HR records one or the employee submits it in the app.
 * A self-submitted one waits through a 24-hour cool-off: only the employee sees it, and they can take it
 * back without a trace. After that it reaches HR, and the employee can still withdraw it until HR starts
 * processing it. The rules enforce the cool-off (sendAt at least ~24 hours after submitting).
 */

export const COOL_OFF_MS = 24 * 60 * 60 * 1000;

export interface ChecklistItem {
  item: string;
  done: boolean;
}

export interface ExitDoc extends BaseRecord {
  status?: "requested" | "processing" | "completed" | "withdrawn";
  /** "self" when the employee submitted it in the app; HR-recorded ones have none. */
  source?: "self";
  receivedOn?: string;
  reason?: string;
  requestedLastDay?: string | null;
  submittedAt?: number;
  /** When a self-submitted resignation leaves its cool-off and reaches HR. */
  sendAt?: number;
  noticePeriodDays?: number;
  lastWorkingDay?: string;
  exitInterviewerId?: string | null;
  exitInterviewerIdLabel?: string | null;
  exitInterviewDate?: string;
  exitInterviewTime?: string;
  checklist?: ChecklistItem[];
  processedBy?: string;
  withdrawnOn?: string;
  withdrawnBy?: string;
}

/** A self-submitted resignation still in its cool-off: HR doesn't see it yet. */
export function isCoolingOff(exit: ExitDoc | null | undefined, now = Date.now()) {
  return Boolean(exit && exit.source === "self" && exit.status === "requested" && Number(exit.sendAt) > now);
}

const isoDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function submitResignation(profile: UserProfile, input: { reason: string; requestedLastDay: string }) {
  if (!profile.employeeId) throw new Error("Your account isn't linked to an employee record yet. Please talk to HR.");
  const now = Date.now();
  // A minute of slack so a slow clock never trips the rule's 24-hour check.
  const sendAt = now + COOL_OFF_MS + 60_000;
  await setDoc(doc(db(), "exits", profile.employeeId), {
    employeeId: profile.employeeId,
    employeeName: profile.employeeIdLabel || profile.displayName,
    status: "requested",
    source: "self",
    receivedOn: isoDate(sendAt),
    requestedLastDay: input.requestedLastDay || null,
    reason: input.reason.trim(),
    userId: profile.id,
    userName: profile.displayName,
    submittedAt: now,
    sendAt,
    createdAt: now,
    updatedAt: now,
  });
}

/** During the cool-off: removes it completely, as if it was never sent. */
export async function cancelResignation(profile: UserProfile) {
  if (profile.employeeId) await deleteDoc(doc(db(), "exits", profile.employeeId));
}

/** After the cool-off, while HR hasn't started processing it. */
export async function withdrawResignation(profile: UserProfile) {
  if (!profile.employeeId) return;
  await updateDoc(doc(db(), "exits", profile.employeeId), { status: "withdrawn", withdrawnOn: todayISO(), withdrawnBy: profile.displayName, updatedAt: Date.now() });
}
