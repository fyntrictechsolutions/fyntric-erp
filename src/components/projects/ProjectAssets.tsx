"use client";

import { ExternalLink, FileText, Film, Image as ImageIcon, Music, NotebookPen, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { friendlyError } from "@/components/resource/RecordEditor";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { formatBytes } from "@/lib/gallery";
import { addFile, addNote, deleteAsset, updateNote, type ProjectAsset } from "@/lib/projectWork";
import type { ProjectWork } from "./ProjectDetail";

function KindIcon({ mime = "", className }: { mime?: string; className?: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className={className} aria-hidden />;
  if (mime.startsWith("video/")) return <Film className={className} aria-hidden />;
  if (mime.startsWith("audio/")) return <Music className={className} aria-hidden />;
  return <FileText className={className} aria-hidden />;
}

/** Files (designs, documents, credentials sheets) and notes for the project. */
export function ProjectAssets({ projectId, manages, assets, loading }: ProjectWork & { assets: ProjectAsset[]; loading: boolean }) {
  const profile = useProfile();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [note, setNote] = useState<ProjectAsset | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "file" | "note">("all");
  const sorted = useMemo(() => [...assets].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)), [assets]);
  const shown = sorted.filter((a) => filter === "all" || a.kind === filter);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    try {
      for (const f of Array.from(list)) {
        setUploading({ name: f.name, progress: 0 });
        await addFile(projectId, f, profile, (p) => setUploading({ name: f.name, progress: p }));
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setUploading(null);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (a: ProjectAsset) => {
    if (!window.confirm(`Delete ${a.kind === "file" ? a.fileName || a.title : "this note"}?`)) return;
    try {
      await deleteAsset(projectId, a);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const files = assets.filter((a) => a.kind === "file").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(
            [
              ["all", `All ${assets.length}`],
              ["file", `Files ${files}`],
              ["note", `Notes ${assets.length - files}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                filter === k ? "border-brand-500 bg-accent-soft text-accent" : "border-line text-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {manages && (
          <div className="flex gap-2">
            <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
            <Button variant="secondary" onClick={() => setNote("new")}>
              <NotebookPen className="size-4" /> Add note
            </Button>
            <Button onClick={() => input.current?.click()} disabled={Boolean(uploading)}>
              <Upload className="size-4" /> Upload files
            </Button>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {uploading && (
        <Card className="p-3 text-sm">
          <p className="truncate text-muted">Uploading {uploading.name}…</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-tint-strong">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.round(uploading.progress * 100)}%` }} />
          </div>
        </Card>
      )}

      {loading && !assets.length ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : !shown.length ? (
        <Card className="px-5 py-10 text-center text-sm text-muted">
          {assets.length ? "Nothing here." : manages ? "No files or notes yet. Upload designs, documents or logins, or write a note." : "No files or notes yet."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => (a.kind === "note" ? <NoteCard key={a.id} note={a} manages={manages} onEdit={() => setNote(a)} onDelete={() => remove(a)} /> : <FileCard key={a.id} file={a} manages={manages} onDelete={() => remove(a)} />))}
        </div>
      )}

      {note && <NoteEditor projectId={projectId} note={note === "new" ? null : note} onClose={() => setNote(null)} />}
    </div>
  );
}

function FileCard({ file, manages, onDelete }: { file: ProjectAsset; manages: boolean; onDelete: () => void }) {
  const isImage = file.mime?.startsWith("image/");
  return (
    <Card className="group flex flex-col overflow-hidden">
      <a href={file.url} target="_blank" rel="noreferrer" className="block">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.url} alt={file.title} loading="lazy" className="h-36 w-full bg-tint object-cover" />
        ) : (
          <div className="grid h-36 place-items-center bg-tint">
            <KindIcon mime={file.mime} className="size-10 text-subtle" />
          </div>
        )}
      </a>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <a href={file.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-foreground hover:text-accent hover:underline" title={file.fileName}>
            {file.fileName || file.title}
          </a>
          <p className="text-xs text-subtle">
            {formatBytes(file.size)} · {String(file.userName ?? "")} · {formatDate(Number(file.createdAt))}
          </p>
        </div>
        <a href={file.url} target="_blank" rel="noreferrer" className="rounded p-1 text-subtle hover:text-foreground" aria-label="Open">
          <ExternalLink className="size-4" />
        </a>
        {manages && (
          <button type="button" onClick={onDelete} className="rounded p-1 text-subtle hover:text-red-600" aria-label={`Delete ${file.fileName}`}>
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </Card>
  );
}

function NoteCard({ note, manages, onEdit, onDelete }: { note: ProjectAsset; manages: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="flex flex-col border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-2">
        <NotebookPen className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <p className="min-w-0 flex-1 font-medium break-words text-foreground">{note.title}</p>
        {manages && (
          <>
            <button type="button" onClick={onEdit} className="rounded p-1 text-subtle hover:text-foreground" aria-label="Edit note">
              <Pencil className="size-3.5" />
            </button>
            <button type="button" onClick={onDelete} className="rounded p-1 text-subtle hover:text-red-600" aria-label="Delete note">
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </div>
      {note.text && <p className="mt-2 max-h-48 overflow-y-auto text-sm whitespace-pre-line break-words text-body">{note.text}</p>}
      <p className="mt-auto pt-3 text-xs text-subtle">
        {String(note.userName ?? "")} · {formatDate(Number(note.updatedAt ?? note.createdAt))}
      </p>
    </Card>
  );
}

function NoteEditor({ projectId, note, onClose }: { projectId: string; note: ProjectAsset | null; onClose: () => void }) {
  const profile = useProfile();
  const [title, setTitle] = useState(note?.title ?? "");
  const [text, setText] = useState(note?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (note) await updateNote(projectId, note.id, title, text);
      else await addNote(projectId, title, text, profile);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={note ? "Edit note" : "New note"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="note-form" disabled={saving || !text.trim()}>
            <Plus className="size-4" /> {saving ? "Saving…" : note ? "Save" : "Add note"}
          </Button>
        </>
      }
    >
      <form
        id="note-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div>
          <label htmlFor="note-title" className={labelClasses}>Title</label>
          <input id="note-title" className={inputClasses} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hosting details" />
        </div>
        <div>
          <label htmlFor="note-text" className={labelClasses}>Note<span className="text-red-500"> *</span></label>
          <textarea id="note-text" required rows={8} autoFocus className={inputClasses} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
