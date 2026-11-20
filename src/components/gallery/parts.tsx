"use client";

import { Check, Copy, ExternalLink, FileText, Film, Globe, Image as ImageIcon, Lock, Mail, MessageCircle, Music, Share2, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatDuration, publicLink, type FileKind, type GalleryFile } from "@/lib/gallery";
import { joinLines, mailHref } from "@/lib/share";

export const KIND_ICONS: Record<FileKind, LucideIcon> = { image: ImageIcon, video: Film, audio: Music, pdf: FileText, document: FileText };

/** Picture preview of a file, or a big icon for kinds without one. */
export function Thumb({ file, className, iconClassName }: { file: GalleryFile; className?: string; iconClassName?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = file.thumbUrl ?? null;
  const Icon = KIND_ICONS[file.kind];
  return (
    <div className={cn("relative overflow-hidden bg-tint", file.kind === "audio" && "bg-gradient-to-br from-brand-500/10 to-accent-violet/10", className)}>
      {url && failed !== url ? (
        // Thumbnails are already small (made when the file was uploaded), so next/image isn't needed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" onError={() => setFailed(url)} className={cn("size-full", file.kind === "audio" ? "object-contain px-3" : "object-cover")} />
      ) : (
        <div className="grid size-full place-items-center text-subtle">
          <Icon className={cn("size-10", iconClassName)} aria-hidden />
        </div>
      )}
      {(file.kind === "video" || file.kind === "audio") && Boolean(file.duration) && (
        <span className="absolute right-1.5 bottom-1.5 rounded bg-ink-950/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">{formatDuration(file.duration)}</span>
      )}
    </div>
  );
}

export function VisibilityBadge({ file, className }: { file: GalleryFile; className?: string }) {
  const priv = file.visibility === "private";
  const Icon = priv ? Lock : Globe;
  return (
    <span
      title={priv ? "Private: only your team can open it" : "Public: anyone with the link can open it"}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        priv ? "bg-tint-strong text-muted" : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {priv ? "Private" : "Public"}
    </span>
  );
}

/**
 * A small menu next to its button. Drawn on <body> with fixed position, so cards and the sidebar
 * can't clip it; opens upwards when there isn't room below and follows its button on scroll.
 */
export function Popover({ open, onClose, anchor, children, className }: { open: boolean; onClose: () => void; anchor: HTMLElement | null; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const place = useCallback(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const menu = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(a.right - menu.width, window.innerWidth - menu.width - 8));
    const below = a.bottom + 4;
    const top = below + menu.height > window.innerHeight - 8 && a.top - menu.height - 4 > 8 ? a.top - menu.height - 4 : below;
    setPos({ left, top });
  }, [anchor]);
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close only the menu, not a viewer behind it.
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      setPos(null);
    };
  }, [open, onClose, anchor, place]);
  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={pos ?? { left: 0, top: 0, visibility: "hidden" }}
      className={cn("fixed z-[60] w-64 rounded-xl border border-line bg-surface p-1.5 text-sm shadow-2xl", className)}
    >
      {children}
    </div>,
    document.body,
  );
}

export const menuItem = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-foreground hover:bg-tint-strong";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy this link:", text);
    return false;
  }
}

/** Link inside the app that opens this file's preview (for teammates). */
export const teamLink = (f: GalleryFile, page: string) => (typeof window === "undefined" ? "" : `${window.location.origin}${page}?file=${f.id}`);

/** Share options for one file: copy link, WhatsApp, email, the phone's share sheet. */
export function ShareMenu({
  file,
  page,
  canEdit,
  onMakePublic,
  businessName,
  buttonClassName,
  label,
}: {
  file: GalleryFile;
  page: string;
  canEdit: boolean;
  onMakePublic: () => void;
  businessName: string;
  buttonClassName?: string;
  label?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState<"public" | "team" | null>(null);
  const link = publicLink(file);
  const text = joinLines([file.productIdLabel ? `${file.name} (${file.productIdLabel})` : file.name, link ?? "", "", businessName]);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const close = useCallback(() => setOpen(false), []);
  const doCopy = async (which: "public" | "team") => {
    await copy(which === "public" ? link! : teamLink(file, page));
    setCopied(which);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div ref={setAnchor} className="relative" onClick={(e) => e.stopPropagation()}>
      {label ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} aria-label="Share" className={buttonClassName}>
          <Share2 className="size-4" /> Share
        </Button>
      ) : (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Share ${file.name}`} className={buttonClassName ?? "rounded-lg p-1.5 text-muted hover:bg-tint-strong hover:text-foreground"}>
          <Share2 className="size-4" />
        </button>
      )}
      <Popover open={open} onClose={close} anchor={anchor}>
        {link ? (
          <>
            <p className="px-2.5 pt-1.5 pb-2 text-xs text-muted">Public link: anyone who has it can open the file.</p>
            <button type="button" className={menuItem} onClick={() => doCopy("public")}>
              {copied === "public" ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4 text-muted" />}
              {copied === "public" ? "Link copied" : "Copy link"}
            </button>
            <a className={menuItem} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
              <MessageCircle className="size-4 text-emerald-600" /> Share on WhatsApp
            </a>
            <a className={menuItem} href={mailHref("", `${file.name} from ${businessName}`, text)} onClick={() => setOpen(false)}>
              <Mail className="size-4 text-muted" /> Send by email
            </a>
            {canNativeShare && (
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  setOpen(false);
                  navigator.share({ title: file.name, text: file.productIdLabel ? `${file.name} (${file.productIdLabel})` : file.name, url: link }).catch(() => undefined);
                }}
              >
                <Share2 className="size-4 text-muted" /> More apps…
              </button>
            )}
            <a className={menuItem} href={link} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
              <ExternalLink className="size-4 text-muted" /> Open public link
            </a>
          </>
        ) : (
          <>
            <p className="flex gap-2 px-2.5 pt-1.5 pb-2 text-xs text-muted">
              <Lock className="mt-0.5 size-3.5 shrink-0" /> Private file: only signed-in team members can open it. Make it public to share it with clients.
            </p>
            {canEdit && (
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  setOpen(false);
                  onMakePublic();
                }}
              >
                <Globe className="size-4 text-emerald-600" /> Make public and share
              </button>
            )}
          </>
        )}
        <div className="my-1 border-t border-line" />
        <button type="button" className={menuItem} onClick={() => doCopy("team")}>
          {copied === "team" ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4 text-muted" />}
          {copied === "team" ? "Team link copied" : "Copy link for the team"}
        </button>
      </Popover>
    </div>
  );
}
