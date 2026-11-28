"use client";

import { Check } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { inputClasses } from "@/components/ui/fieldStyles";
import type { FieldDefinition } from "@/config/modules";
import { collection, query, where } from "firebase/firestore";
import { canRead, INTERNAL_ROLES, type ModuleKey } from "@/config/roles";
import { useLiveQuery } from "@/hooks/useCollection";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase";
import { scopedQuery } from "@/lib/records";
import type { BaseRecord } from "@/types";

/** Roles that can be picked as a project manager. */
export const MANAGER_ROLES = ["admin", "project_manager"];

/** The records a reference field can pick from, as sorted options. */
function useReferenceOptions(field: FieldDefinition) {
  const { profile } = useAuth();
  const ref = field.reference!;
  const team = ref.module === "team";
  const managers = ref.module === "managers";
  // Team members come from user accounts, which only admins may list; everyone else sees just themselves.
  const listsTeam = team && profile?.role === "admin";
  // Admins and project managers may list the accounts that can manage a project.
  const listsManagers = managers && MANAGER_ROLES.includes(String(profile?.role));
  const allowed = profile ? (team ? listsTeam : managers ? listsManagers : canRead(profile.role, ref.module as ModuleKey)) : false;
  const { data, loading } = useLiveQuery(
    () => {
      if (!profile || !allowed) return null;
      if (team) return query(collection(db(), "users"), where("active", "==", true));
      if (managers) return query(collection(db(), "users"), where("role", "in", MANAGER_ROLES));
      return scopedQuery(ref.module as ModuleKey, profile);
    },
    `${ref.module}:${profile?.id}:${allowed}`,
  );

  let rows: BaseRecord[] = team
    ? listsTeam
      ? data.filter((u) => (INTERNAL_ROLES as string[]).includes(String(u.role)))
      : profile
        ? [{ id: profile.id, displayName: profile.displayName }]
        : []
    : managers
      ? data.filter((u) => u.active !== false)
      : data;
  if (ref.filter) rows = rows.filter(ref.filter);
  const options = rows
    .map((r) => ({ value: r.id, label: ref.format ? ref.format(r) : String(r[ref.labelField] || r.email || "Untitled") }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { rows, options, allowed, loading };
}

interface Props {
  field: FieldDefinition;
  id: string;
  value: string;
  label: string;
  disabled?: boolean;
  /** `picked` is the chosen record (missing when cleared or when the saved choice can't be listed). */
  onChange: (value: string, label: string, picked?: BaseRecord) => void;
}

/** Dropdown of records from another module (e.g. pick a client for a project). */
export function ReferenceSelect({ field, id, value, label, disabled, onChange }: Props) {
  const { rows, options, allowed, loading } = useReferenceOptions(field);
  // Keep the saved choice visible even if it can't be listed (no access, deleted or filtered out).
  if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: label || "(unavailable)" });

  return (
    <select
      id={id}
      className={inputClasses}
      value={value}
      required={field.required}
      disabled={disabled || (allowed && loading)}
      onChange={(e) => onChange(e.target.value, e.target.selectedOptions[0]?.text ?? "", rows.find((r) => r.id === e.target.value))}
    >
      <option value="">{allowed && loading ? "Loading…" : "Select…"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Several records from another module, picked as chips (e.g. a project's team). */
export function ReferenceChips({
  field,
  id,
  value,
  labels,
  disabled,
  onChange,
}: {
  field: FieldDefinition;
  id: string;
  value: string[];
  labels: string[];
  disabled?: boolean;
  onChange: (ids: string[], labels: string[]) => void;
}) {
  const { options, allowed, loading } = useReferenceOptions(field);
  // Saved choices that can't be listed any more stay visible (and can be removed).
  value.forEach((v, i) => {
    if (!options.some((o) => o.value === v)) options.push({ value: v, label: labels[i] || "(unavailable)" });
  });
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? "";
  const toggle = (v: string) => {
    const next = value.includes(v) ? value.filter((x) => x !== v) : [...value, v];
    onChange(next, next.map(labelOf));
  };
  return (
    <div id={id} role="group" aria-label={field.label} className="flex flex-wrap gap-2 pt-0.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              on ? "border-brand-500 bg-accent-soft font-medium text-accent" : "border-line text-body hover:border-line-strong",
            )}
          >
            {on && <Check className="size-3.5" aria-hidden />}
            {o.label}
          </button>
        );
      })}
      {!options.length && <p className="text-sm text-subtle">{allowed && loading ? "Loading…" : "Nobody to pick yet."}</p>}
    </div>
  );
}
