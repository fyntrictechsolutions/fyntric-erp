"use client";

import { AlertCircle, CheckCircle2, Globe, Lock, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { friendlyError } from "@/components/resource/RecordEditor";
import { Button } from "@/components/ui/Button";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import {
  baseName,
  formatBytes,
  KIND_LABELS,
  kindOf,
  MAX_BYTES,
  setVisibility,
  updateGalleryFile,
  uploadToGallery,
  type GalleryFile,
  type GalleryKey,
  type Visibility,
} from "@/lib/gallery";
import type { BaseRecord } from "@/types";
import { KIND_ICONS } from "./parts";

export const ACCEPT = "image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";

/** Product picker with products and services in separate groups. Not required. */
export function ProductSelect({ products, value, onChange, id, emptyLabel = "Not linked to a product" }: { products: BaseRecord[]; value: string; onChange: (id: string) => void; id?: string; emptyLabel?: string }) {
  const groups = [
    { label: "Products", items: products.filter((p) => p.kind === "product") },
    { label: "Services", items: products.filter((p) => p.kind !== "product") },
  ];
  return (
    <select id={id} className={inputClasses} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <optgroup key={g.label} label={g.label}>
              {[...g.items]
                .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {String(p.name)}
                  </option>
                ))}
            </optgroup>
          ),
      )}
    </select>
  );
}

const parseTags = (text: string) => [...new Set(text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);

/** Public / private choice, asked on every upload. */
export function VisibilityChoice({ value, onChange }: { value: Visibility | null; onChange: (v: Visibility) => void }) {
  const options: { v: Visibility; icon: typeof Lock; title: string; text: string }[] = [
    { v: "private", icon: Lock, title: "Private", text: "Only signed-in team members can open it." },
    { v: "public", icon: Globe, title: "Public", text: "Gets a link you can share with clients on WhatsApp or email." },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who can open the file">
      {options.map(({ v, icon: Icon, title, text }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "flex gap-3 rounded-xl border p-3 text-left transition-colors",
            value === v ? "border-brand-500 bg-brand-500/8 ring-2 ring-brand-500/20" : "border-line-strong hover:bg-tint",
          )}
        >
          <Icon className={cn("mt-0.5 size-4 shrink-0", value === v ? "text-brand-600" : "text-muted")} />
          <span>
            <span className="block text-sm font-medium text-foreground">{title}</span>
            <span className="block text-xs text-muted">{text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

interface Pending {
  key: string;
  file: File;
  name: string;
  progress: number;
  state: "waiting" | "uploading" | "done" | "error";
  error?: string;
}

const tooBig = (f: File) => f.size > MAX_BYTES[kindOf(f)];

export function UploadDialog({
  gallery,
  products,
  initialFiles,
  initialProductId,
  onClose,
}: {
  gallery: GalleryKey;
  products: BaseRecord[];
  initialFiles: File[];
  initialProductId: string;
  onClose: () => void;
}) {
  const profile = useProfile();
  const input = useRef<HTMLInputElement>(null);
  const toPending = (files: File[]): Pending[] =>
    files.map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      name: baseName(file.name),
      progress: 0,
      state: tooBig(file) ? "error" : "waiting",
      error: tooBig(file) ? `Too large: ${KIND_LABELS[kindOf(file)]} files can be up to ${formatBytes(MAX_BYTES[kindOf(file)])}.` : undefined,
    }));
  const [items, setItems] = useState<Pending[]>(() => toPending(initialFiles));
  const [productId, setProductId] = useState(initialProductId);
  const [visibility, setVis] = useState<Visibility | null>(null);
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const add = (list: FileList | File[] | null) => list && setItems((old) => [...old, ...toPending(Array.from(list))]);
  const patch = (key: string, p: Partial<Pending>) => setItems((old) => old.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const ready = items.filter((i) => i.state === "waiting" || (i.state === "error" && !tooBig(i.file)));
  const allDone = items.length > 0 && items.every((i) => i.state === "done");

  const start = async () => {
    if (!visibility || !ready.length) return;
    setBusy(true);
    const product = products.find((p) => p.id === productId);
    let failed = false;
    for (const item of ready) {
      patch(item.key, { state: "uploading", progress: 0, error: undefined });
      try {
        await uploadToGallery(
          gallery,
          {
            file: item.file,
            name: item.name,
            visibility,
            productId: product?.id ?? null,
            productIdLabel: product ? String(product.name) : null,
            tags: parseTags(tags),
            description,
          },
          profile,
          (progress) => patch(item.key, { progress }),
        );
        patch(item.key, { state: "done", progress: 1 });
      } catch (e) {
        failed = true;
        patch(item.key, { state: "error", error: friendlyError(e) });
      }
    }
    setBusy(false);
    if (!failed) onClose();
  };

  return (
    <Modal
      open
      wide
      title="Upload files"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {allDone ? "Close" : "Cancel"}
          </Button>
          <Button onClick={start} disabled={busy || !visibility || !ready.length}>
            <Upload className="size-4" /> {busy ? "Uploading…" : ready.length > 1 ? `Upload ${ready.length} files` : "Upload"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={cn("rounded-xl border-2 border-dashed p-5 text-center transition-colors", dragging ? "border-brand-500 bg-brand-500/8" : "border-line-strong")}
        >
          <Upload className="mx-auto size-6 text-muted" />
          <p className="mt-2 text-sm text-foreground">
            Drop files here or{" "}
            <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => input.current?.click()} disabled={busy}>
              choose files
            </button>
          </p>
          <p className="mt-1 text-xs text-subtle">Images, PDFs and documents up to 10 MB. Videos and audio up to 100 MB.</p>
          <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
        </div>

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((i) => {
              const Icon = KIND_ICONS[kindOf(i.file)];
              return (
                <li key={i.key} className="rounded-xl border border-line p-3">
                  <div className="flex items-center gap-3">
                    <Icon className="size-5 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <input
                        aria-label="File name"
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-foreground hover:border-line-strong focus:border-brand-500 focus:outline-none"
                        value={i.name}
                        disabled={busy || i.state === "done"}
                        onChange={(e) => patch(i.key, { name: e.target.value })}
                      />
                      <p className="truncate px-1 text-xs text-subtle">
                        {i.file.name} · {formatBytes(i.file.size)}
                      </p>
                    </div>
                    {i.state === "done" ? (
                      <CheckCircle2 className="size-5 text-emerald-600" aria-label="Uploaded" />
                    ) : (
                      !busy && (
                        <button type="button" aria-label={`Remove ${i.file.name}`} className="rounded p-1 text-muted hover:bg-tint-strong" onClick={() => setItems((old) => old.filter((x) => x.key !== i.key))}>
                          <X className="size-4" />
                        </button>
                      )
                    )}
                  </div>
                  {i.state === "uploading" && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-tint-strong">
                      <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${Math.round(i.progress * 100)}%` }} />
                    </div>
                  )}
                  {i.error && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
                      <AlertCircle className="mt-px size-3.5 shrink-0" /> {i.error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div>
          <p className={labelClasses}>
            Who can open {items.length > 1 ? "these files" : "this file"}? <span className="text-red-600">*</span>
          </p>
          <VisibilityChoice value={visibility} onChange={setVis} />
          <p className="mt-1.5 text-xs text-subtle">You can change this later from the file&apos;s menu.</p>
        </div>

        <div>
          <label htmlFor="up-product" className={labelClasses}>
            Product or service
          </label>
          <ProductSelect id="up-product" products={products} value={productId} onChange={setProductId} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="up-tags" className={labelClasses}>
              Tags
            </label>
            <input id="up-tags" className={inputClasses} placeholder="brochure, demo, 2026" value={tags} onChange={(e) => setTags(e.target.value)} />
            <p className="mt-1 text-xs text-subtle">Separate with commas. Tags help search.</p>
          </div>
          <div>
            <label htmlFor="up-desc" className={labelClasses}>
              Description
            </label>
            <input id="up-desc" className={inputClasses} placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Rename, re-link, tag, or change who can open a file. */
export function EditDialog({ file, products, onClose }: { file: GalleryFile; products: BaseRecord[]; onClose: () => void }) {
  const [name, setName] = useState(file.name);
  const [productId, setProductId] = useState(file.productId ?? "");
  const [tags, setTags] = useState((file.tags ?? []).join(", "));
  const [description, setDescription] = useState(file.description ?? "");
  const [visibility, setVis] = useState<Visibility>(file.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return setError("Give the file a name.");
    setBusy(true);
    setError(null);
    try {
      const product = products.find((p) => p.id === productId);
      await updateGalleryFile(file, {
        name: name.trim(),
        productId: product?.id ?? null,
        productIdLabel: product ? String(product.name) : null,
        tags: parseTags(tags),
        description: description.trim(),
      });
      if (visibility !== file.visibility) await setVisibility(file, visibility);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Edit file"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="ed-name" className={labelClasses}>
            Name
          </label>
          <input id="ed-name" className={inputClasses} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ed-product" className={labelClasses}>
            Product or service
          </label>
          <ProductSelect id="ed-product" products={products} value={productId} onChange={setProductId} />
        </div>
        <div>
          <p className={labelClasses}>Who can open it</p>
          <VisibilityChoice value={visibility} onChange={setVis} />
          {visibility !== file.visibility && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
              {visibility === "private" ? "The public link will stop working for anyone you've shared it with." : "The file will get a public link anyone can open."}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="ed-tags" className={labelClasses}>
            Tags
          </label>
          <input id="ed-tags" className={inputClasses} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="brochure, demo" />
        </div>
        <div>
          <label htmlFor="ed-desc" className={labelClasses}>
            Description
          </label>
          <textarea id="ed-desc" rows={3} className={inputClasses} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
