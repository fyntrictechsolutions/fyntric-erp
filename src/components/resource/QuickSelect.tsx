"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { useSettings } from "@/components/settings/SettingsProvider";
import type { Tone } from "@/components/ui/Badge";
import type { FieldDefinition, ModuleDefinition } from "@/config/modules";
import { cn } from "@/lib/cn";
import { updateRecord } from "@/lib/records";
import type { BaseRecord } from "@/types";
import { optionsFor } from "./RecordForm";
import { friendlyError } from "./RecordEditor";

const TONES: Record<Tone, string> = {
  neutral: "bg-tint-strong text-muted",
  blue: "bg-brand-500/12 text-brand-700 dark:text-brand-300",
  green: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/12 text-red-700 dark:text-red-300",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
};

/** A status badge that is also a dropdown: picking a value saves it straight away (e.g. a lead's stage). */
export function QuickSelect({ module, field, record, className }: { module: ModuleDefinition; field: FieldDefinition; record: BaseRecord; className?: string }) {
  const profile = useProfile();
  const settings = useSettings();
  const [saving, setSaving] = useState(false);
  const value = String(record[field.name] ?? "");
  const options = optionsFor(field, settings);
  const current = options.find((o) => o.value === value);

  const change = async (next: string) => {
    if (next === value) return;
    setSaving(true);
    try {
      await updateRecord(module.key, record.id, { [field.name]: next });
      await module.afterChange?.({ ...record, [field.name]: next }, { profile, settings });
    } catch (e) {
      window.alert(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className={cn("relative inline-flex items-center rounded-full", TONES[current?.tone ?? "neutral"], saving && "opacity-60", className)} onClick={(e) => e.stopPropagation()}>
      <select
        aria-label={`Change ${field.label.toLowerCase()}`}
        title={`Change ${field.label.toLowerCase()}`}
        value={value}
        disabled={saving}
        onChange={(e) => void change(e.target.value)}
        className="cursor-pointer appearance-none rounded-full bg-transparent py-0.5 pr-6 pl-2.5 text-xs font-medium text-inherit focus:ring-2 focus:ring-brand-500/40 focus:outline-none"
      >
        {!current && <option value={value}>{value || "Select…"}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface text-foreground">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 size-3.5" aria-hidden />
    </span>
  );
}
