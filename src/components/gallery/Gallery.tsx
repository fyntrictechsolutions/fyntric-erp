"use client";

import { collection, query, where } from "firebase/firestore";
import { ChevronDown, ChevronRight, CloudOff, Download, Globe, Images, LayoutGrid, List, Lock, MoreVertical, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { NoAccess } from "@/components/resource/ModulePage";
import { friendlyError } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClasses } from "@/components/ui/fieldStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { canRead, permissionFor, type ModuleKey } from "@/config/roles";
import { useLiveQuery, useModuleRecords } from "@/hooks/useCollection";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase";
import type { BaseRecord } from "@/types";
import { formatDate } from "@/lib/format";
import { deleteGalleryFile, fileUrl, formatBytes, KIND_LABELS, setVisibility, storageConfigured, type FileKind, type GalleryFile, type GalleryKey } from "@/lib/gallery";
import { EditDialog, UploadDialog } from "./dialogs";
import { KIND_ICONS, menuItem, Popover, ShareMenu, Thumb, useSignatures, VisibilityBadge } from "./parts";
import { Preview } from "./Preview";

type Sort = "newest" | "oldest" | "name-asc" | "name-desc" | "size-desc" | "size-asc";
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "size-desc", label: "Largest first" },
  { value: "size-asc", label: "Smallest first" },
];

const KINDS: FileKind[] = ["image", "video", "audio", "pdf", "document"];
const NO_PRODUCT = "__none";

function compare(sort: Sort) {
  return (a: GalleryFile, b: GalleryFile) => {
    switch (sort) {
      case "oldest":
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      case "name-asc":
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      case "name-desc":
        return b.name.localeCompare(a.name, undefined, { numeric: true });
      case "size-desc":
        return (b.size ?? 0) - (a.size ?? 0);
      case "size-asc":
        return (a.size ?? 0) - (b.size ?? 0);
      default:
        return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    }
  };
}

/** Per-viewer view settings, remembered in this browser when it allows. */
function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      /* private mode */
    }
  };
  return [value, set];
}

interface GalleryProps {
  gallery: GalleryKey;
  /** Permission module for this gallery, e.g. "salesGallery". */
  module: ModuleKey;
  title: string;
  description: string;
}

/**
 * A gallery of files linked to products: upload, browse grouped by product, filter, preview and share.
 * Each gallery (only "sales" for now) is the same page with its own `gallery` key and permission.
 */
export function Gallery(props: GalleryProps) {
  const profile = useProfile();
  if (!canRead(profile.role, props.module)) return <NoAccess />;
  return <GalleryInner {...props} />;
}

function GalleryInner({ gallery, module, title, description }: GalleryProps) {
  const profile = useProfile();
  const settings = useSettings();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const canEdit = permissionFor(profile.role, module).create;

  const { data: files, loading, error } = useLiveQuery<GalleryFile>(() => query(collection(db(), "gallery"), where("gallery", "==", gallery)), `gallery:${gallery}:${profile.id}`);
  const { data: products } = useModuleRecords("products", profile);
  const signatures = useSignatures(gallery, files);

  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    storageConfigured().then((ok) => live && setConfigured(ok));
    return () => {
      live = false;
    };
  }, []);

  // Filters and view
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState("");
  const [kind, setKind] = useState<FileKind | "">("");
  const [visibility, setVisibilityFilter] = useState<"" | "public" | "private">("");
  const [sort, setSort] = usePref<Sort>(`gallery-${gallery}-sort`, "newest");
  const [view, setView] = usePref<"grid" | "list">(`gallery-${gallery}-view`, "grid");
  const [grouping, setGrouping] = usePref<"product" | "none">(`gallery-${gallery}-group`, "product");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Dialogs
  const [upload, setUpload] = useState<File[] | null>(null);
  const [uploadProduct, setUploadProduct] = useState("");
  const [editing, setEditing] = useState<GalleryFile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files
      .filter((f) => !kind || f.kind === kind)
      .filter((f) => !visibility || f.visibility === visibility)
      .filter((f) => {
        if (!product) return true;
        if (product === NO_PRODUCT) return !f.productId;
        if (product === "__products") return productById.get(f.productId ?? "")?.kind === "product";
        if (product === "__services") return Boolean(f.productId) && productById.get(f.productId ?? "")?.kind !== "product";
        return f.productId === product;
      })
      .filter((f) => !q || [f.name, f.productIdLabel, f.description, f.fileName, ...(f.tags ?? [])].some((v) => String(v ?? "").toLowerCase().includes(q)))
      .sort(compare(sort));
  }, [files, kind, visibility, product, search, sort, productById]);

  const groups = useMemo(() => {
    if (grouping === "none") return [{ key: "all", label: "", productKind: null as string | null, files: filtered }];
    const map = new Map<string, GalleryFile[]>();
    for (const f of filtered) {
      const k = f.productId || NO_PRODUCT;
      map.set(k, [...(map.get(k) ?? []), f]);
    }
    return [...map.entries()]
      .map(([key, list]) => ({
        key,
        label: key === NO_PRODUCT ? "Not linked to a product" : String(productById.get(key)?.name ?? list[0].productIdLabel ?? "Removed product"),
        productKind: key === NO_PRODUCT ? null : ((productById.get(key)?.kind as string | undefined) ?? null),
        files: list,
      }))
      .sort((a, b) => (a.key === NO_PRODUCT ? 1 : b.key === NO_PRODUCT ? -1 : a.label.localeCompare(b.label)));
  }, [filtered, grouping, productById]);

  // Preview follows ?file=<id>, so a teammate's link opens the file.
  const openId = params.get("file");
  const order = useMemo(() => groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.files)), [groups, collapsed]);
  const openIndex = openId ? order.findIndex((f) => f.id === openId) : -1;
  const openFile = openIndex >= 0 ? order[openIndex] : openId ? (files.find((f) => f.id === openId) ?? null) : null;
  const show = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("file", id);
      else next.delete("file");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  const step = useCallback(
    (by: number) => {
      if (!order.length) return;
      const i = openIndex < 0 ? 0 : (openIndex + by + order.length) % order.length;
      show(order[i].id);
    },
    [order, openIndex, show],
  );

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  };

  const makePublic = async (f: GalleryFile) => {
    try {
      await setVisibility(f, "public");
      flash(`${f.name} is now public. Open Share again to send the link.`);
    } catch (e) {
      flash(friendlyError(e));
    }
  };

  const remove = async (f: GalleryFile) => {
    if (!window.confirm(`Delete ${f.name}? The file is removed for everyone${f.visibility === "public" ? " and its public link stops working" : ""}.`)) return;
    try {
      if (openId === f.id) show(null);
      await deleteGalleryFile(f);
      flash(`${f.name} deleted.`);
    } catch (e) {
      flash(friendlyError(e));
    }
  };

  const totalSize = files.reduce((t, f) => t + (Number(f.size) || 0), 0);
  const kindCounts = KINDS.map((k) => ({ k, n: files.filter((f) => f.kind === k).length })).filter((x) => x.n > 0);
  const filtersOn = Boolean(search || product || kind || visibility);
  const page = pathname;
  const businessName = settings.business.name;

  const card = (f: GalleryFile) => (
    <FileCard
      key={f.id}
      file={f}
      signatures={signatures}
      canEdit={canEdit}
      page={page}
      businessName={businessName}
      showProduct={grouping === "none"}
      onOpen={() => show(f.id)}
      onEdit={() => setEditing(f)}
      onDelete={() => remove(f)}
      onMakePublic={() => makePublic(f)}
    />
  );

  return (
    <div
      className="relative animate-fade-up"
      onDragOver={(e) => {
        if (!canEdit || !configured || upload || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        if (!canEdit || !configured || upload) return;
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) setUpload(Array.from(e.dataTransfer.files));
      }}
    >
      <PageHeader
        title={title}
        description={description}
        actions={
          canEdit && (
            <Button onClick={() => (setUploadProduct(product && !product.startsWith("__") ? product : ""), setUpload([]))} disabled={!configured}>
              <Upload className="size-4" /> Upload files
            </Button>
          )
        }
      />

      {configured === false && (
        <Card className="mb-6 border-amber-500/40 p-5">
          <div className="flex gap-3">
            <CloudOff className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-medium text-foreground">File storage isn&apos;t connected yet</p>
              <p className="mt-1 text-muted">
                The gallery keeps files on Cloudinary&apos;s free plan. An admin needs to add the Cloudinary keys (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET) in Vercel and redeploy. The setup guide in the project docs has the steps.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary: counts per type double as type filters. */}
      {files.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setKind("")}
            className={cn("rounded-full border px-3 py-1", !kind ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300" : "border-line-strong text-muted hover:bg-tint")}
          >
            All files <span className="tabular-nums">{files.length}</span>
          </button>
          {kindCounts.map(({ k, n }) => {
            const Icon = KIND_ICONS[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(kind === k ? "" : k)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
                  kind === k ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300" : "border-line-strong text-muted hover:bg-tint",
                )}
              >
                <Icon className="size-3.5" /> {KIND_LABELS[k]}
                {k === "pdf" || k === "audio" ? "" : "s"} <span className="tabular-nums">{n}</span>
              </button>
            );
          })}
          <span className="ml-auto text-xs text-subtle">{formatBytes(totalSize)} used</span>
        </div>
      )}

      <Card className="mb-6 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input className={cn(inputClasses, "pl-9")} placeholder="Search name, tag, product…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search files" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <div className="col-span-2 sm:w-56">
              <ProductFilter products={products} value={product} onChange={setProduct} />
            </div>
            <select className={cn(inputClasses, "sm:w-40")} value={visibility} onChange={(e) => setVisibilityFilter(e.target.value as typeof visibility)} aria-label="Public or private">
              <option value="">Public & private</option>
              <option value="public">Public only</option>
              <option value="private">Private only</option>
            </select>
            <select className={cn(inputClasses, "sm:w-40")} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select className={cn(inputClasses, "sm:w-44")} value={grouping} onChange={(e) => setGrouping(e.target.value as typeof grouping)} aria-label="Group">
              <option value="product">Group by product</option>
              <option value="none">No grouping</option>
            </select>
            <div className="flex rounded-lg border border-line-strong p-0.5" role="group" aria-label="View">
              {(
                [
                  ["grid", LayoutGrid, "Thumbnails"],
                  ["list", List, "List"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  title={label}
                  className={cn("grid flex-1 place-items-center rounded-md px-2.5 py-1.5", view === v ? "bg-tint-strong text-foreground" : "text-muted hover:text-foreground")}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
        {filtersOn && (
          <div className="mt-2 flex items-center gap-2 px-1 text-xs text-muted">
            Showing {filtered.length} of {files.length}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-brand-600 hover:underline"
              onClick={() => {
                setSearch("");
                setProduct("");
                setKind("");
                setVisibilityFilter("");
              }}
            >
              <X className="size-3" /> Clear filters
            </button>
          </div>
        )}
      </Card>

      {notice && <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-ink-950 px-4 py-2.5 text-sm text-white shadow-2xl">{notice}</div>}

      {loading ? (
        <div className="grid place-items-center py-20">
          <Spinner className="size-7" />
        </div>
      ) : error ? (
        <Card>
          <EmptyState title="Couldn't load the gallery" description={friendlyError(new Error(error))} />
        </Card>
      ) : files.length === 0 ? (
        <Card>
          <EmptyState
            icon={Images}
            title="No files yet"
            description="Keep product photos, brochures, demo videos and recordings here, linked to the products and services they're about."
            action={
              canEdit &&
              configured && (
                <Button onClick={() => setUpload([])}>
                  <Upload className="size-4" /> Upload files
                </Button>
              )
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No files match" description="Try another search or clear the filters." />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            return (
              <section key={g.key}>
                {grouping === "product" && (
                  <div className="mb-3 flex items-center gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 text-left"
                      onClick={() =>
                        setCollapsed((old) => {
                          const next = new Set(old);
                          if (next.has(g.key)) next.delete(g.key);
                          else next.add(g.key);
                          return next;
                        })
                      }
                      aria-expanded={!isCollapsed}
                    >
                      {isCollapsed ? <ChevronRight className="size-4 shrink-0 text-muted" /> : <ChevronDown className="size-4 shrink-0 text-muted" />}
                      <h2 className="truncate font-display text-base font-semibold text-foreground">{g.label}</h2>
                    </button>
                    {g.productKind && <Badge tone={g.productKind === "product" ? "blue" : "violet"}>{g.productKind === "product" ? "Product" : "Service"}</Badge>}
                    <span className="text-xs whitespace-nowrap text-subtle tabular-nums">
                      {g.files.length} file{g.files.length === 1 ? "" : "s"}
                    </span>
                    {g.key !== NO_PRODUCT && canRead(profile.role, "products") && (
                      <Link href={`/crm/products`} className="ml-auto hidden text-xs whitespace-nowrap text-muted hover:text-foreground hover:underline sm:inline">
                        Price list
                      </Link>
                    )}
                    {canEdit && configured && (
                      <button
                        type="button"
                        className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium whitespace-nowrap text-brand-600 hover:underline", g.key === NO_PRODUCT || !canRead(profile.role, "products") ? "ml-auto" : "max-sm:ml-auto")}
                        onClick={() => {
                          setUpload([]);
                          setUploadProduct(g.key === NO_PRODUCT ? "" : g.key);
                        }}
                      >
                        <Upload className="size-3" /> Add here
                      </button>
                    )}
                  </div>
                )}
                {!isCollapsed &&
                  (view === "grid" ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{g.files.map(card)}</div>
                  ) : (
                    <Card className="divide-y divide-line">
                      {g.files.map((f) => (
                        <FileRow
                          key={f.id}
                          file={f}
                          signatures={signatures}
                          canEdit={canEdit}
                          page={page}
                          businessName={businessName}
                          showProduct={grouping === "none"}
                          onOpen={() => show(f.id)}
                          onEdit={() => setEditing(f)}
                          onDelete={() => remove(f)}
                          onMakePublic={() => makePublic(f)}
                        />
                      ))}
                    </Card>
                  ))}
              </section>
            );
          })}
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-brand-500/10 backdrop-blur-[2px]">
          <div className="rounded-2xl border-2 border-dashed border-brand-500 bg-surface px-10 py-8 text-center shadow-2xl">
            <Upload className="mx-auto size-8 text-brand-600" />
            <p className="mt-2 font-medium text-foreground">Drop to upload</p>
          </div>
        </div>
      )}

      {upload && <UploadDialog gallery={gallery} products={products} initialFiles={upload} initialProductId={uploadProduct} onClose={() => setUpload(null)} />}
      {editing && <EditDialog file={files.find((f) => f.id === editing.id) ?? editing} products={products} onClose={() => setEditing(null)} />}
      {openFile && (
        <Preview
          file={openFile}
          index={Math.max(openIndex, 0)}
          count={Math.max(order.length, 1)}
          signatures={signatures}
          canEdit={canEdit}
          page={page}
          businessName={businessName}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => show(null)}
          onEdit={() => setEditing(openFile)}
          onMakePublic={() => makePublic(openFile)}
        />
      )}
    </div>
  );
}

/** Product filter: everything, products only, services only, not linked, or one item. */
function ProductFilter({ products: list, value, onChange }: { products: BaseRecord[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputClasses} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Product or service">
      <option value="">All products & services</option>
      <option value="__products">Products only</option>
      <option value="__services">Services only</option>
      <option value={NO_PRODUCT}>Not linked to a product</option>
      {(["product", "service"] as const).map((k) => {
        const items = list.filter((p) => (k === "product" ? p.kind === "product" : p.kind !== "product")).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return (
          items.length > 0 && (
            <optgroup key={k} label={k === "product" ? "Products" : "Services"}>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {String(p.name)}
                </option>
              ))}
            </optgroup>
          )
        );
      })}
    </select>
  );
}

interface ItemProps {
  file: GalleryFile;
  signatures: Record<string, string>;
  canEdit: boolean;
  page: string;
  businessName: string;
  showProduct: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMakePublic: () => void;
}

function MoreMenu({ file, signatures, canEdit, onEdit, onDelete, onMakePublic }: Pick<ItemProps, "file" | "signatures" | "canEdit" | "onEdit" | "onDelete" | "onMakePublic">) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const download = fileUrl(file, "download", signatures);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div ref={setAnchor} className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`More actions for ${file.name}`} className="rounded-lg p-1.5 text-muted hover:bg-tint-strong hover:text-foreground">
        <MoreVertical className="size-4" />
      </button>
      <Popover open={open} onClose={close} anchor={anchor} className="w-52">
        {download && (
          <a href={download} className={menuItem} target="_blank" rel="noreferrer" onClick={close}>
            <Download className="size-4 text-muted" /> Download
          </a>
        )}
        {canEdit && (
          <>
            <button type="button" className={menuItem} onClick={() => (close(), onEdit())}>
              <Pencil className="size-4 text-muted" /> Edit details
            </button>
            {file.visibility === "private" ? (
              <button type="button" className={menuItem} onClick={() => (close(), onMakePublic())}>
                <Globe className="size-4 text-muted" /> Make public
              </button>
            ) : (
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  close();
                  if (window.confirm(`Make ${file.name} private? Its public link will stop working.`)) setVisibility(file, "private").catch((e) => window.alert(friendlyError(e)));
                }}
              >
                <Lock className="size-4 text-muted" /> Make private
              </button>
            )}
            <div className="my-1 border-t border-line" />
            <button type="button" className={cn(menuItem, "text-red-600")} onClick={() => (close(), onDelete())}>
              <Trash2 className="size-4" /> Delete
            </button>
          </>
        )}
      </Popover>
    </div>
  );
}

function FileCard(p: ItemProps) {
  const { file } = p;
  const Icon = KIND_ICONS[file.kind];
  return (
    <div className="group rounded-xl border border-line bg-surface shadow-card transition-shadow hover:shadow-lg">
      <button type="button" onClick={p.onOpen} className="relative block w-full overflow-hidden rounded-t-xl text-left" aria-label={`Open ${file.name}`}>
        <Thumb file={file} signatures={p.signatures} className="aspect-[4/3] w-full" />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-ink-950/70 px-2 py-0.5 text-[11px] font-medium text-white">
          <Icon className="size-3" /> {KIND_LABELS[file.kind]}
        </span>
        {file.visibility === "private" && (
          <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-ink-950/70 text-white" title="Private">
            <Lock className="size-3" />
          </span>
        )}
      </button>
      <div className="flex items-start gap-1 p-2.5">
        <button type="button" onClick={p.onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-foreground" title={file.name}>
            {file.name}
          </p>
          <p className="truncate text-xs text-subtle">
            {p.showProduct && file.productIdLabel ? `${file.productIdLabel} · ` : ""}
            {formatBytes(file.size)} · {formatDate(file.createdAt)}
          </p>
        </button>
        <ShareMenu file={file} page={p.page} canEdit={p.canEdit} onMakePublic={p.onMakePublic} businessName={p.businessName} />
        <MoreMenu {...p} />
      </div>
    </div>
  );
}

function FileRow(p: ItemProps) {
  const { file } = p;
  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-tint">
      <button type="button" onClick={p.onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Thumb file={file} signatures={p.signatures} className="h-12 w-16 shrink-0 rounded-md" iconClassName="size-5" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{file.name}</span>
          <span className="block truncate text-xs text-subtle">
            {KIND_LABELS[file.kind]}
            {p.showProduct && file.productIdLabel ? ` · ${file.productIdLabel}` : ""}
            {file.tags?.length ? ` · ${file.tags.map((t) => `#${t}`).join(" ")}` : ""}
          </span>
        </span>
      </button>
      <span className="hidden w-20 text-right text-xs text-muted tabular-nums sm:block">{formatBytes(file.size)}</span>
      <span className="hidden w-24 text-right text-xs text-muted md:block">{formatDate(file.createdAt)}</span>
      <VisibilityBadge file={file} className="hidden sm:inline-flex" />
      <ShareMenu file={file} page={p.page} canEdit={p.canEdit} onMakePublic={p.onMakePublic} businessName={p.businessName} />
      <MoreMenu {...p} />
    </div>
  );
}
