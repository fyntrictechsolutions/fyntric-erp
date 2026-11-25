import { collection, doc, writeBatch } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { loggedAdd, loggedDelete, loggedSet, loggedUpdate } from "@/lib/audit";
import { db, storage } from "@/lib/firebase";
import type { BaseRecord, UserProfile } from "@/types";

/**
 * A project's own work lists, kept under the project: projects/{id}/tasks (the task board),
 * projects/{id}/assets (files and notes) and projects/{id}/checklist (the delivery checklist).
 * Admins and project managers run them; the rest of the team sees them and moves the tasks
 * assigned to them. Files are in Storage under projects/{id}/{asset id}/.
 */

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

export const TASK_COLUMNS: { key: TaskStatus; label: string; dot: string }[] = [
  { key: "todo", label: "To do", dot: "bg-slate-400" },
  { key: "in_progress", label: "In progress", dot: "bg-blue-500" },
  { key: "in_review", label: "In review", dot: "bg-amber-500" },
  { key: "done", label: "Done", dot: "bg-emerald-500" },
];

export interface ProjectTask extends BaseRecord {
  title: string;
  notes?: string;
  status: TaskStatus;
  /** Employee record the task is assigned to. */
  assigneeId?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
  /** Position within its column (smaller first). */
  order: number;
}

export interface ProjectAsset extends BaseRecord {
  kind: "file" | "note";
  title: string;
  /** Notes: the text. */
  text?: string;
  /** Files: where it's stored and how to open it. */
  path?: string;
  url?: string;
  fileName?: string;
  mime?: string;
  size?: number;
}

export interface ChecklistEntry extends BaseRecord {
  text: string;
  done: boolean;
  order: number;
  doneBy?: string | null;
  doneAt?: number | null;
}

type Sub = "tasks" | "assets" | "checklist";
const sub = (projectId: string, name: Sub) => collection(db(), "projects", projectId, name);
const item = (projectId: string, name: Sub, id: string) => doc(db(), "projects", projectId, name, id);

const stamp = (profile: UserProfile) => {
  const now = Date.now();
  return { userId: profile.id, userName: profile.displayName, createdBy: profile.id, createdAt: now, updatedAt: now };
};

/** Puts the list in the given order (only the entries whose position changed are written). */
async function saveOrder(projectId: string, name: Sub, ordered: { id: string; order: number }[]) {
  const batch = writeBatch(db());
  let writes = 0;
  ordered.forEach((x, i) => {
    if (x.order === i) return;
    batch.update(item(projectId, name, x.id), { order: i, updatedAt: Date.now() });
    writes++;
  });
  if (writes) await batch.commit();
}

// ---------- Tasks ----------

export async function addTask(projectId: string, input: Pick<ProjectTask, "title" | "assigneeId" | "assigneeName" | "dueDate" | "notes" | "status">, order: number, profile: UserProfile) {
  await loggedAdd(sub(projectId, "tasks"), { ...input, title: input.title.trim(), notes: input.notes?.trim() ?? "", order, ...stamp(profile) });
}

export async function updateTask(projectId: string, id: string, data: Partial<ProjectTask>) {
  await loggedUpdate(item(projectId, "tasks", id), { ...data, updatedAt: Date.now() });
}

export async function deleteTask(projectId: string, id: string) {
  await loggedDelete(item(projectId, "tasks", id));
}

/** After a drag: every column's tasks in their new order, with the moved task's new status. */
export async function moveTask(projectId: string, columns: Record<TaskStatus, ProjectTask[]>, movedId: string, status: TaskStatus) {
  const ordered = Object.values(columns).flatMap((list) => list.map((t, i) => ({ id: t.id, order: t.order, index: i })));
  const batch = writeBatch(db());
  let writes = 0;
  for (const t of ordered) {
    const moved = t.id === movedId;
    if (!moved && t.order === t.index) continue;
    batch.update(item(projectId, "tasks", t.id), { order: t.index, ...(moved ? { status } : {}), updatedAt: Date.now() });
    writes++;
  }
  if (writes) await batch.commit();
}

// ---------- Assets ----------

export async function addNote(projectId: string, title: string, text: string, profile: UserProfile) {
  await loggedAdd(sub(projectId, "assets"), { kind: "note", title: title.trim() || "Note", text: text.trim(), ...stamp(profile) });
}

export async function updateNote(projectId: string, id: string, title: string, text: string) {
  await loggedUpdate(item(projectId, "assets", id), { title: title.trim() || "Note", text: text.trim(), updatedAt: Date.now() });
}

/** Largest file: 25 MB, or 200 MB for video and audio. storage.rules enforces the same. */
export const maxBytes = (f: File) => (/^(video|audio)\//.test(f.type) ? 200 : 25) * 1024 * 1024;

const safeName = (name: string) => name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file";

export async function addFile(projectId: string, file: File, profile: UserProfile, onProgress: (fraction: number) => void) {
  if (file.size > maxBytes(file)) throw new Error(`${file.name} is too large. Files can be up to ${maxBytes(file) / 1024 / 1024} MB.`);
  const entry = doc(sub(projectId, "assets"));
  const fileName = safeName(file.name);
  const path = `projects/${projectId}/${entry.id}/${fileName}`;
  const mime = file.type || "application/octet-stream";
  const target = ref(storage(), path);
  const url = await new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(target, file, { contentType: mime, contentDisposition: `inline; filename="${fileName}"` });
    task.on(
      "state_changed",
      (s) => onProgress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      (err) => reject(new Error((err as { code?: string }).code === "storage/unauthorized" ? "Storage refused the file. It may be too large, or you may not be allowed to add files here." : err.message)),
      () => getDownloadURL(target).then(resolve, reject),
    );
  });
  await loggedSet(entry, { kind: "file", title: file.name, path, url, fileName: file.name, mime, size: file.size, ...stamp(profile) });
}

export async function deleteAsset(projectId: string, asset: ProjectAsset) {
  if (asset.path) await deleteObject(ref(storage(), asset.path)).catch(() => undefined);
  await loggedDelete(item(projectId, "assets", asset.id));
}

// ---------- Delivery checklist ----------

export async function addChecklistItem(projectId: string, text: string, order: number, profile: UserProfile) {
  await loggedAdd(sub(projectId, "checklist"), { text: text.trim(), done: false, order, doneBy: null, doneAt: null, ...stamp(profile) });
}

export async function setChecklistDone(projectId: string, id: string, done: boolean, profile: UserProfile) {
  await loggedUpdate(item(projectId, "checklist", id), { done, doneBy: done ? profile.displayName : null, doneAt: done ? Date.now() : null, updatedAt: Date.now() });
}

export async function updateChecklistText(projectId: string, id: string, text: string) {
  await loggedUpdate(item(projectId, "checklist", id), { text: text.trim(), updatedAt: Date.now() });
}

export async function deleteChecklistItem(projectId: string, id: string) {
  await loggedDelete(item(projectId, "checklist", id));
}

export const reorderChecklist = (projectId: string, ordered: ChecklistEntry[]) => saveOrder(projectId, "checklist", ordered);

/** Oldest first within the same position, so new entries land at the end. */
export const byOrder = <T extends { order?: number; createdAt?: unknown }>(a: T, b: T) =>
  (Number(a.order) || 0) - (Number(b.order) || 0) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
