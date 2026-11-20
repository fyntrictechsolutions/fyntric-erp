"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { inputClasses } from "@/components/ui/fieldStyles";
import type { FieldDefinition } from "@/config/modules";
import { collection, query, where } from "firebase/firestore";
import { canRead, INTERNAL_ROLES } from "@/config/roles";
import { useLiveQuery } from "@/hooks/useCollection";
import { db } from "@/lib/firebase";
import { scopedQuery } from "@/lib/records";
import type { BaseRecord } from "@/types";

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
  const team = ref.module === "team";
  // Team members come from user accounts, which only admins may list; everyone else sees just themselves.
  const listsTeam = team && profile?.role === "admin";
  const allowed = profile ? (team ? listsTeam : canRead(profile.role, ref.module as Exclude<typeof ref.module, "team">)) : false;
  const { data, loading } = useLiveQuery(
    () => {
      if (!profile || !allowed) return null;
      if (team) return query(collection(db(), "users"), where("active", "==", true));
      return scopedQuery(ref.module as Exclude<typeof ref.module, "team">, profile);
    },
    `${ref.module}:${profile?.id}:${allowed}`,
  );

  const rows: BaseRecord[] = team
    ? listsTeam
      ? data.filter((u) => (INTERNAL_ROLES as string[]).includes(String(u.role)))
      : profile
        ? [{ id: profile.id, displayName: profile.displayName }]
        : []
    : data;
  const options = rows
    .map((r) => ({ value: r.id, label: String(r[ref.labelField] || r.email || "Untitled") }))
    .sort((a, b) => a.label.localeCompare(b.label));
  // Keep the saved choice visible even if it can't be listed (no access or deleted).
  if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: label || "(unavailable)" });

  return (
    <select
      id={id}
      className={inputClasses}
      value={value}
      required={field.required}
      disabled={disabled || (allowed && loading)}
      onChange={(e) => onChange(e.target.value, e.target.selectedOptions[0]?.text ?? "")}
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
