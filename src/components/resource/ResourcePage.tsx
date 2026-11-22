"use client";

import { ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClasses } from "@/components/ui/fieldStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import type { FieldDefinition, ModuleDefinition, RecordAction } from "@/config/modules";
import type { Role } from "@/config/roles";
import { useModuleRecords } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { cn } from "@/lib/cn";
import { deleteRecord, updateRecord } from "@/lib/records";
import type { BaseRecord } from "@/types";
import { FieldValue } from "./FieldValue";
import { QuickSelect } from "./QuickSelect";
import { optionsFor } from "./RecordForm";
import { friendlyError, RecordEditor } from "./RecordEditor";

export { friendlyError };

interface ResourcePageProps {
  module: ModuleDefinition;
  /** Extra content above the list, e.g. the attendance check-in card. */
  intro?: React.ReactNode;
  /** Overrides the page title (e.g. "My Attendance"). */
  title?: string;
}

/**
 * A complete list + create/edit screen for one module, driven by its definition
 * in src/config/modules. Respects the user's role for every button and query.
 */
export function ResourcePage({ module, intro, title }: ResourcePageProps) {
  const profile = useProfile();
  const settings = useSettings();
  const router = useRouter();
  const role = profile.role as Role;
  const access = moduleAccess(module, profile);
  const { data, loading, error } = useModuleRecords(module.key, profile, module.ownRecordsOnly);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<{ record: BaseRecord | null } | null>(null);

  const statusField = module.fields.find((f) => f.name === module.statusField);
  const statusOptions = statusField ? optionsFor(statusField, settings) : [];
  const columns = module.columns
    .map((c): Column | null => {
      const group = typeof c === "string" ? { label: "", fields: [c] } : c;
      const fields = group.fields.map((n) => module.fields.find((f) => f.name === n)).filter((f): f is FieldDefinition => Boolean(f) && !f!.hiddenFor?.includes(role));
      return fields.length ? { key: group.fields.join("+"), label: group.label || fields[0].label, fields, prefixes: typeof c === "string" ? undefined : c.prefixes } : null;
    })
    .filter((c): c is Column => c !== null);
  const showOwner = Boolean(module.ownerLabel && access.seesEveryone);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.filter((r) => {
      if (status && r[module.statusField!] !== status) return false;
      if (!term) return true;
      return module.searchFields.some((f) => String(r[f] ?? "").toLowerCase().includes(term));
    });
  }, [data, search, status, module.searchFields, module.statusField]);

  const close = useCallback(() => setEditor(null), []);
  const openCreate = () => setEditor({ record: null });

  const remove = async (record: BaseRecord) => {
    if (!window.confirm(`Delete this ${module.singular.toLowerCase()}? This can't be undone.`)) return;
    try {
      await deleteRecord(module.key, record.id);
      await module.afterDelete?.(record, { profile, settings });
      await module.afterChange?.(record, { profile, settings });
    } catch (e) {
      window.alert(friendlyError(e));
    }
  };

  const runAction = async (action: RecordAction, record: BaseRecord) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    try {
      if (action.run) await action.run(record, { profile, settings });
      else if (action.patch) await updateRecord(module.key, record.id, action.patch(record, { profile, settings }));
    } catch (e) {
      window.alert(friendlyError(e));
    }
  };

  const actionsFor = (record: BaseRecord) =>
    (module.actions ?? []).filter((a) => a.when(record) && (a.requires === "manager" ? access.isManager : access.canEdit(record)));

  const rowProps = (r: BaseRecord) =>
    module.detailHref
      ? { onClick: () => router.push(module.detailHref!(r.id)), className: "cursor-pointer" }
      : {};
  const Icon = module.icon;
  const newLabel = `New ${module.singular.toLowerCase()}`;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={title ?? module.title}
        description={module.description}
        actions={
          access.canCreate && (
            <Button onClick={openCreate}>
              <Plus className="size-4" aria-hidden /> {newLabel}
            </Button>
          )
        }
      />

      {intro}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${(title ?? module.title).toLowerCase()}…`}
              className={cn(inputClasses, "pl-9")}
              aria-label={`Search ${module.title}`}
            />
          </div>
          {statusOptions.length > 0 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:pb-0">
              <FilterChip active={!status} onClick={() => setStatus("")} label="All" count={data.length} />
              {statusOptions.map((o) => (
                <FilterChip
                  key={o.value}
                  active={status === o.value}
                  onClick={() => setStatus(o.value)}
                  label={o.label}
                  count={data.filter((r) => r[statusField!.name] === o.value).length}
                />
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState title="Couldn't load this list" description={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Icon}
            title={data.length ? "Nothing matches your filters" : `No ${(title ?? module.title).toLowerCase()} yet`}
            description={data.length ? "Try a different search or status." : access.canCreate ? `Add the first ${module.singular.toLowerCase()} to get started.` : undefined}
            action={!data.length && access.canCreate ? <Button onClick={openCreate}><Plus className="size-4" /> {newLabel}</Button> : undefined}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-tint text-xs tracking-wide text-muted uppercase">
                  <tr>
                    {showOwner && <th className="px-4 py-3 font-medium">{module.ownerLabel}</th>}
                    {columns.map((c) => (
                      <th key={c.key} className="px-4 py-3 font-medium whitespace-nowrap">{c.label}</th>
                    ))}
                    <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} {...rowProps(r)} className={cn("text-body transition-colors hover:bg-tint", rowProps(r).className)}>
                      {showOwner && <td className="px-4 py-3 font-medium text-foreground">{r.userName ?? "—"}</td>}
                      {columns.map((c, i) => (
                        <td key={c.key} className={cn("max-w-xs px-4 py-3", i === 0 && !showOwner && "font-medium text-foreground")}>
                          <ColumnCell column={c} record={r} href={i === 0 && module.detailHref ? module.detailHref(r.id) : undefined} quick={access.canEdit(r) ? module : undefined} />
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <RowActions
                          record={r}
                          actions={actionsFor(r)}
                          onAction={runAction}
                          onEdit={access.canEdit(r) ? (rec) => setEditor({ record: rec }) : undefined}
                          onDelete={access.canDelete(r) ? remove : undefined}
                          showChevron={Boolean(module.detailHref)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {rows.map((r) => (
                <li key={r.id} {...rowProps(r)} className={cn("space-y-2 p-4", rowProps(r).className)}>
                  {showOwner && <p className="text-xs font-medium text-muted">{module.ownerLabel}: {r.userName ?? "—"}</p>}
                  <div className="font-medium text-foreground"><ColumnCell column={columns[0]} record={r} /></div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {columns.slice(1).map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-xs text-subtle">{c.label}</dt>
                        <dd className="truncate"><ColumnCell column={c} record={r} quick={access.canEdit(r) ? module : undefined} /></dd>
                      </div>
                    ))}
                  </dl>
                  <RowActions
                    record={r}
                    actions={actionsFor(r)}
                    onAction={runAction}
                    onEdit={access.canEdit(r) ? (rec) => setEditor({ record: rec }) : undefined}
                    onDelete={access.canDelete(r) ? remove : undefined}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {editor && <RecordEditor module={module} record={editor.record} onClose={close} />}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-brand-500 bg-accent-soft text-accent" : "border-line text-muted hover:border-line-strong hover:text-foreground",
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

export function RowActions({
  record,
  actions,
  onAction,
  onEdit,
  onDelete,
  showChevron,
}: {
  record: BaseRecord;
  actions: RecordAction[];
  onAction: (a: RecordAction, r: BaseRecord) => void;
  onEdit?: (r: BaseRecord) => void;
  onDelete?: (r: BaseRecord) => void;
  showChevron?: boolean;
}) {
  if (!actions.length && !onEdit && !onDelete && !showChevron) return null;
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {actions.map((a) => {
        const AIcon = a.icon;
        return (
          <Button key={a.label} size="sm" variant={a.variant ?? "secondary"} onClick={stop(() => onAction(a, record))}>
            {AIcon && <AIcon className="size-3.5" aria-hidden />} {a.label}
          </Button>
        );
      })}
      {onEdit && (
        <Button size="sm" variant="ghost" onClick={stop(() => onEdit(record))} aria-label="Edit" title="Edit">
          <Pencil className="size-4" />
        </Button>
      )}
      {onDelete && (
        <Button size="sm" variant="ghost" onClick={stop(() => onDelete(record))} aria-label="Delete" title="Delete" className="hover:text-red-600">
          <Trash2 className="size-4" />
        </Button>
      )}
      {showChevron && <ChevronRight className="size-4 text-subtle" aria-hidden />}
    </div>
  );
}

interface Column {
  key: string;
  label: string;
  fields: FieldDefinition[];
  prefixes?: Record<string, string>;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** "EST-202611-3004" → "EST-…3004": keeps the start and the distinguishing end. */
function shorten(text: string) {
  return text.length > 10 ? `${text.slice(0, 4)}…${text.slice(-4)}` : text;
}

/** One table cell: a single field, or several stacked (empty ones skipped). */
function ColumnCell({ column, record, href, quick }: { column: Column; record: BaseRecord; href?: string; quick?: ModuleDefinition }) {
  const [first, ...rest] = column.fields;
  const value = (f: FieldDefinition) =>
    quick && f.quickEdit ? (
      <QuickSelect module={quick} field={f} record={record} />
    ) : f.shortenMiddle && typeof record[f.name] === "string" ? (
      <span title={String(record[f.name])} className="whitespace-nowrap">{shorten(String(record[f.name]))}</span>
    ) : (
      <FieldValue field={f} record={record} />
    );
  const main = href ? (
    <Link href={href} onClick={(e) => e.stopPropagation()} className="hover:text-accent hover:underline">
      {value(first)}
    </Link>
  ) : (
    value(first)
  );
  const extra = rest.filter((f) => !isEmpty(record[f.name]) && !(f.type === "reference" && isEmpty(record[`${f.name}Label`])));
  if (!extra.length) return main;
  return (
    <div className="min-w-0">
      <div>{main}</div>
      {extra.map((f) => (
        <div key={f.name} className="mt-0.5 text-xs font-normal text-muted">
          {column.prefixes?.[f.name]}
          {value(f)}
        </div>
      ))}
    </div>
  );
}
