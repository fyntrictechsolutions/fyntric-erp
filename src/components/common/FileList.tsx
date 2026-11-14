"use client";

import { FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { friendlyError } from "@/components/resource/RecordEditor";
import { Button } from "@/components/ui/Button";
import { useRecordsWhere } from "@/hooks/useCollection";
import { deleteFile, openFile, saveFile, type StoredFile } from "@/lib/files";
import { formatDate } from "@/lib/format";
import type { BaseRecord } from "@/types";

/** Files attached to one record (e.g. a candidate's certificates), with upload and delete. */
export function FileList({
  ownerType,
  ownerId,
  kind,
  canEdit,
  emptyText = "Nothing uploaded yet.",
  accept = "image/*,application/pdf",
  multiple = true,
}: {
  ownerType: string;
  ownerId: string;
  kind: string;
  canEdit: boolean;
  emptyText?: string;
  accept?: string;
  multiple?: boolean;
}) {
  const profile = useProfile();
  const { data, loading } = useRecordsWhere<BaseRecord & StoredFile>("files", "ownerId", ownerId);
  const files = data.filter((f) => f.ownerType === ownerType && f.kind === kind);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(list)) await saveFile({ ownerType, ownerId, kind }, f, profile);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (f: StoredFile) => {
    if (!window.confirm(`Delete ${f.name}?`)) return;
    try {
      await deleteFile(f.id);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <div>
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
              <button type="button" onClick={() => void openFile(f)} className="min-w-0 flex-1 truncate text-left font-medium text-foreground hover:text-accent hover:underline">
                {f.name}
              </button>
              <span className="hidden text-xs text-subtle sm:inline">
                {(f.size / 1000).toFixed(0)} KB · {formatDate(f.createdAt)}
              </span>
              {canEdit && (
                <button type="button" onClick={() => remove(f)} className="rounded p-1 text-subtle hover:text-red-600" aria-label={`Delete ${f.name}`}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {canEdit && (
        <div className="mt-3">
          <input ref={input} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => upload(e.target.files)} />
          <Button size="sm" variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Upload className="size-3.5 animate-pulse" /> : <Paperclip className="size-3.5" />} {busy ? "Uploading…" : "Upload"}
          </Button>
          <span className="ml-2 text-xs text-subtle">Photos or PDFs up to 0.7 MB; photos are shrunk automatically.</span>
        </div>
      )}
    </div>
  );
}
