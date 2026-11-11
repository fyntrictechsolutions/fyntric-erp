"use client";

import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import type { ModuleDefinition, RecordAction } from "@/config/modules";
import type { Role } from "@/config/roles";
import { useModuleRecords } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { cn } from "@/lib/cn";
import { createRecord, deleteRecord, updateRecord } from "@/lib/records";
import type { BaseRecord } from "@/types";
import { FieldValue } from "./FieldValue";
import { initialValues, RecordForm, toStoredValues } from "./RecordForm";

interface ResourcePageProps {
  module: ModuleDefinition;
  /** Extra content above the list, e.g. the attendance check-in card. */
  intro?: React.ReactNode;
}

/**
 * A complete list + create/edit screen for one module, driven by its definition
 * in src/config/modules. Respects the user's role for every button and query.
 */
export function ResourcePage({ module, intro }: ResourcePageProps) {
  const profile = useProfile();
  const role = profile.role as Role;
  const access = moduleAccess(module, profile);
  const { data, loading, error } = useModuleRecords(module.key, profile);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<BaseRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const statusField = module.fields.find((f) => f.name === module.statusField);
  const columns = module.columns
    .map((name) => module.fields.find((f) => f.name === name)!)
    .filter((f) => f && !f.hiddenFor?.includes(role));
  const showOwner = Boolean(module.ownerLabel && access.seesEveryone);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.filter((r) => {
      if (status && r[module.statusField!] !== status) return false;
      if (!term) return true;
      return module.searchFields.some((f) => String(r[f] ?? "").toLowerCase().includes(term));
    });
  }, [data, search, status, module.searchFields, module.statusField]);

  const openCreate = () => {
    setValues(initialValues(module));
    setEditing(null);
    setCreating(true);
    setMessage(null);
  };
  const openEdit = (record: BaseRecord) => {
    setValues(initialValues(module, record));
    setEditing(record);
    setCreating(true);
    setMessage(null);
  };
  const close = useCallback(() => setCreating(false), []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const stored = toStoredValues(module, values);
      if (editing) await updateRecord(module.key, editing.id, stored);
      else await createRecord(module.key, stored, profile);
      setCreating(false);
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (record: BaseRecord) => {
    if (!window.confirm(`Delete this ${module.singular.toLowerCase()}? This can't be undone.`)) return;
    try {
      await deleteRecord(module.key, record.id);
    } catch (e) {
      window.alert(friendlyError(e));
    }
  };

  const runAction = async (action: RecordAction, record: BaseRecord) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    try {
      if (action.run) await action.run(record, { profile });
      else if (action.patch) await updateRecord(module.key, record.id, action.patch(record, { profile }));
    } catch (e) {
      window.alert(friendlyError(e));
    }
  };

  const actionsFor = (record: BaseRecord) =>
    (module.actions ?? []).filter((a) => a.when(record) && (a.requires === "manager" ? access.isManager : access.canEdit(record)));

  const Icon = module.icon;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={module.title}
        description={module.description}
        actions={
          access.canCreate && (
            <Button onClick={openCreate}>
              <Plus className="size-4" aria-hidden /> New {module.singular.toLowerCase()}
            </Button>
          )
        }
      />

      {intro}

      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${module.title.toLowerCase()}…`}
              className={cn(inputClasses, "pl-9")}
              aria-label={`Search ${module.title}`}
            />
          </div>
          {statusField?.options && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:pb-0">
              <FilterChip active={!status} onClick={() => setStatus("")} label="All" count={data.length} />
              {statusField.options.map((o) => (
                <FilterChip
                  key={o.value}
                  active={status === o.value}
                  onClick={() => setStatus(o.value)}
                  label={o.label}
                  count={data.filter((r) => r[statusField.name] === o.value).length}
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
            title={data.length ? "Nothing matches your filters" : `No ${module.title.toLowerCase()} yet`}
            description={data.length ? "Try a different search or status." : access.canCreate ? `Add the first ${module.singular.toLowerCase()} to get started.` : undefined}
            action={!data.length && access.canCreate ? <Button onClick={openCreate}><Plus className="size-4" /> New {module.singular.toLowerCase()}</Button> : undefined}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-tint text-xs tracking-wide text-muted uppercase">
                  <tr>
                    {showOwner && <th className="px-4 py-3 font-medium">{module.ownerLabel}</th>}
                    {columns.map((c) => (
                      <th key={c.name} className="px-4 py-3 font-medium whitespace-nowrap">{c.label}</th>
                    ))}
                    <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className="text-body transition-colors hover:bg-tint">
                      {showOwner && <td className="px-4 py-3 font-medium text-foreground">{r.userName ?? "—"}</td>}
                      {columns.map((c, i) => (
                        <td key={c.name} className={cn("max-w-xs px-4 py-3", i === 0 && !showOwner && "font-medium text-foreground")}>
                          <FieldValue field={c} record={r} />
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <RowActions record={r} actions={actionsFor(r)} onAction={runAction} onEdit={access.canEdit(r) ? openEdit : undefined} onDelete={access.canDelete(r) ? remove : undefined} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <ul className="divide-y divide-line md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="space-y-2 p-4">
                  {showOwner && <p className="text-xs font-medium text-muted">{module.ownerLabel}: {r.userName ?? "—"}</p>}
                  <div className="font-medium text-foreground"><FieldValue field={columns[0]} record={r} /></div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {columns.slice(1).map((c) => (
                      <div key={c.name} className="min-w-0">
                        <dt className="text-xs text-subtle">{c.label}</dt>
                        <dd className="truncate"><FieldValue field={c} record={r} /></dd>
                      </div>
                    ))}
                  </dl>
                  <RowActions record={r} actions={actionsFor(r)} onAction={runAction} onEdit={access.canEdit(r) ? openEdit : undefined} onDelete={access.canDelete(r) ? remove : undefined} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={close}
        wide
        title={editing ? `Edit ${module.singular.toLowerCase()}` : `New ${module.singular.toLowerCase()}`}
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button type="submit" form={`form-${module.key}`} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : `Add ${module.singular.toLowerCase()}`}
            </Button>
          </>
        }
      >
        {message && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}
        <RecordForm
          formId={`form-${module.key}`}
          module={module}
          values={values}
          onChange={setValues}
          onSubmit={save}
          role={role}
          isManager={access.isManager}
          isEditing={Boolean(editing)}
        />
      </Modal>
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

function RowActions({
  record,
  actions,
  onAction,
  onEdit,
  onDelete,
}: {
  record: BaseRecord;
  actions: RecordAction[];
  onAction: (a: RecordAction, r: BaseRecord) => void;
  onEdit?: (r: BaseRecord) => void;
  onDelete?: (r: BaseRecord) => void;
}) {
  if (!actions.length && !onEdit && !onDelete) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {actions.map((a) => {
        const AIcon = a.icon;
        return (
          <Button key={a.label} size="sm" variant={a.variant ?? "secondary"} onClick={() => onAction(a, record)}>
            {AIcon && <AIcon className="size-3.5" aria-hidden />} {a.label}
          </Button>
        );
      })}
      {onEdit && (
        <Button size="sm" variant="ghost" onClick={() => onEdit(record)} aria-label="Edit" title="Edit">
          <Pencil className="size-4" />
        </Button>
      )}
      {onDelete && (
        <Button size="sm" variant="ghost" onClick={() => onDelete(record)} aria-label="Delete" title="Delete" className="hover:text-red-600">
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("permission") || msg.includes("PERMISSION_DENIED")) return "You don't have permission to do that.";
  return msg;
}
