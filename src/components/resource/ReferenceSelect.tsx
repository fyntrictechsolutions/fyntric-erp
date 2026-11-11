"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { inputClasses } from "@/components/ui/fieldStyles";
import type { FieldDefinition } from "@/config/modules";
import { canRead } from "@/config/roles";
import { useLiveQuery } from "@/hooks/useCollection";
import { scopedQuery } from "@/lib/records";

interface Props {
  field: FieldDefinition;
  id: string;
  value: string;
  label: string;
  disabled?: boolean;
  onChange: (value: string, label: string) => void;
}

/** Dropdown of records from another module (e.g. pick a client for a project). */
export function ReferenceSelect({ field, id, value, label, disabled, onChange }: Props) {
  const { profile } = useAuth();
  const ref = field.reference!;
  const allowed = profile ? canRead(profile.role, ref.module) : false;
  const { data, loading } = useLiveQuery(
    () => (profile && allowed ? scopedQuery(ref.module, profile) : null),
    `${ref.module}:${profile?.id}:${allowed}`,
  );

  const options = data
    .map((r) => ({ value: r.id, label: String(r[ref.labelField] ?? "Untitled") }))
    .sort((a, b) => a.label.localeCompare(b.label));
  // Keep the saved choice visible even if it can't be listed (no access or deleted).
  if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: label || "(unavailable)" });

  return (
    <select
      id={id}
      className={inputClasses}
      value={value}
      required={field.required}
      disabled={disabled || loading}
      onChange={(e) => onChange(e.target.value, e.target.selectedOptions[0]?.text ?? "")}
    >
      <option value="">{loading ? "Loading…" : "Select…"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
