"use client";

import { ChevronLeft, ChevronRight, Download, Pencil, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { formatDate } from "@/lib/format";
import { downloadFile, formatBytes, formatDuration, KIND_LABELS, type GalleryFile } from "@/lib/gallery";
import { KIND_ICONS, ShareMenu, VisibilityBadge } from "./parts";

const iconButton = "grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white";

/** Full-screen viewer: images, video, audio and PDFs play in place; arrow keys move between files. */
export function Preview({
  file,
  index,
  count,
  canEdit,
  page,
  businessName,
  onPrev,
  onNext,
  onClose,
  onEdit,
  onMakePublic,
}: {
  file: GalleryFile;
  index: number;
  count: number;
  canEdit: boolean;
  page: string;
  businessName: string;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onEdit: () => void;
  onMakePublic: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, onPrev, onNext]);

  const view = file.url;
  const Icon = KIND_ICONS[file.kind];
  const details = [
    KIND_LABELS[file.kind] + (/\.(\w{1,5})$/.test(file.fileName ?? "") ? ` (${file.fileName.split(".").pop()!.toUpperCase()})` : ""),
    formatBytes(file.size),
    file.width && file.height ? `${file.width} × ${file.height}` : null,
    file.duration ? formatDuration(file.duration) : null,
    file.pages ? `${file.pages} page${file.pages === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  let body: React.ReactNode;
  if (!view) body = <p className="text-sm text-white/70">Loading…</p>;
  else if (file.kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    body = <img src={view} alt={file.name} className="max-h-full max-w-full rounded object-contain shadow-2xl" />;
  else if (file.kind === "video") body = <video key={view} src={view} controls autoPlay playsInline className="max-h-full max-w-full rounded shadow-2xl" />;
  else if (file.kind === "audio")
    body = (
      <div className="w-full max-w-xl rounded-2xl bg-white/5 p-6 text-center">
        <Icon className="mx-auto size-12 text-white/60" />
        <p className="mt-3 font-medium text-white">{file.name}</p>
        <audio key={view} src={view} controls autoPlay className="mt-5 w-full" />
      </div>
    );
  else if (file.kind === "pdf") body = <iframe key={view} src={view} title={file.name} className="size-full rounded bg-white shadow-2xl" />;
  else
    body = (
      <div className="rounded-2xl bg-white/5 p-8 text-center">
        <Icon className="mx-auto size-12 text-white/60" />
        <p className="mt-3 font-medium text-white">{file.name}</p>
        <p className="mt-1 text-sm text-white/60">This file can&apos;t be previewed. Download it to open.</p>
        <button type="button" onClick={() => downloadFile(file)} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-ink-950">
          <Download className="size-4" /> Download
        </button>
      </div>
    );

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950/95 backdrop-blur" role="dialog" aria-modal="true" aria-label={file.name}>
      <header className="flex items-center gap-3 border-b border-white/10 px-3 py-2 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-white">{file.name}</p>
          <p className="truncate text-xs text-white/60">
            {file.productIdLabel ? `${file.productIdLabel} · ` : ""}
            {index + 1} of {count}
          </p>
        </div>
        <VisibilityBadge file={file} className="hidden sm:inline-flex" />
        <ShareMenu file={file} page={page} canEdit={canEdit} onMakePublic={onMakePublic} businessName={businessName} buttonClassName={iconButton} />
        <button type="button" onClick={() => downloadFile(file)} className={iconButton} aria-label="Download" title="Download">
          <Download className="size-4" />
        </button>
        {canEdit && (
          <button type="button" className={iconButton} onClick={onEdit} aria-label="Edit" title="Edit">
            <Pencil className="size-4" />
          </button>
        )}
        <button type="button" className={iconButton} onClick={onClose} aria-label="Close" title="Close (Esc)">
          <X className="size-5" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:px-16 sm:py-6">
        {body}
        {count > 1 && (
          <>
            <button type="button" onClick={onPrev} aria-label="Previous file" className="absolute top-1/2 left-2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={onNext} aria-label="Next file" className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4">
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      <footer className="border-t border-white/10 px-3 py-2.5 text-xs text-white/60 sm:px-5">
        <p>
          {details.join(" · ")} · Added {formatDate(file.createdAt)}
          {file.userName ? ` by ${String(file.userName)}` : ""}
        </p>
        {Boolean(file.description || file.tags?.length) && (
          <p className="mt-1 text-white/80">
            {file.description}
            {file.tags?.length ? <span className="text-white/50">{file.description ? " · " : ""}{file.tags.map((t) => `#${t}`).join(" ")}</span> : null}
          </p>
        )}
      </footer>
    </div>,
    document.body,
  );
}
