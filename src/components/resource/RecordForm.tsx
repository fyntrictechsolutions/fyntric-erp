"use client";

import { Check } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useSettings, type Settings } from "@/components/settings/SettingsProvider";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import type { FieldDefinition, FormContext, ModuleDefinition, SelectOption } from "@/config/modules";
import type { Role } from "@/config/roles";
import { cn } from "@/lib/cn";
import { asList } from "@/lib/format";
import type { BaseRecord } from "@/types";
import { LineItemsEditor } from "./LineItemsEditor";
import { ReferenceChips, ReferenceSelect } from "./ReferenceSelect";

type Values = Record<string, unknown>;

/** Options for a select: fixed ones, or the admin-editable list from Settings. */
export function optionsFor(field: FieldDefinition, settings: Settings): SelectOption[] {
  if (field.list) return settings.lists[field.list].map((v) => ({ value: v, label: v }));
  return field.options ?? [];
}

/** Initial form values: the record being edited, or each field's default for a new one. */
export function initialValues(module: ModuleDefinition, ctx: FormContext, record?: BaseRecord | null, preset?: Values): Values {
  if (record) {
    const values: Values = module.toForm ? module.toForm(record) : { ...record };
    for (const f of module.fields) if (f.type === "multiselect" || f.type === "references") values[f.name] = asList(record[f.name]);
    return values;
  }
  const values: Values = {};
  for (const f of module.fields) {
    if (f.defaultToMe && ctx.profile) {
      values[f.name] = ctx.profile.id;
      values[`${f.name}Label`] = ctx.profile.displayName;
      continue;
    }
    if (f.defaultValue === undefined) continue;
    values[f.name] = typeof f.defaultValue === "function" ? f.defaultValue(ctx) : f.defaultValue;
  }
  return { ...values, ...preset };
}

/** Turns form strings into stored values (numbers for numeric fields, "" for cleared values becomes null). */
export function toStoredValues(module: ModuleDefinition, values: Values, ctx: FormContext): Values {
  const out: Values = { ...values };
  for (const f of module.fields) {
    const v = out[f.name];
    if (["number", "currency", "percent"].includes(f.type)) {
      out[f.name] = v === "" || v === undefined || v === null ? null : Number(v);
    } else if (f.type === "checkbox") {
      out[f.name] = Boolean(v);
    } else if (f.type === "multiselect") {
      out[f.name] = asList(v);
    } else if (f.type === "references") {
      out[f.name] = asList(v);
      out[`${f.name}Label`] = asList(out[`${f.name}Label`]);
    } else if (v === "") {
      out[f.name] = null;
    }
  }
  return module.beforeSave ? module.beforeSave(out, ctx) : out;
}

/** Fields this person sees in the form for these values. */
export function visibleFields(module: ModuleDefinition, values: Values, role: Role, isManager: boolean, isEditing = false) {
  return module.fields.filter(
    (f) =>
      !f.computed &&
      !(f.createOnly && isEditing) &&
      !f.hidden &&
      !(f.managerOnly && !isManager) &&
      !f.hiddenFor?.includes(role) &&
      (!f.showWhen || f.showWhen(values)),
  );
}

interface RecordFormProps {
  formId: string;
  module: ModuleDefinition;
  values: Values;
  onChange: (values: Values) => void;
  onSubmit: () => void;
  role: Role;
  isManager: boolean;
  isEditing: boolean;
}

export function RecordForm({ formId, module, values, onChange, onSubmit, role, isManager, isEditing }: RecordFormProps) {
  const [touched, setTouched] = useState(false);
  const visible = visibleFields(module, values, role, isManager, isEditing);
  // Filling from another record is async, so patches merge into the latest values, not the ones at click time.
  const latest = useRef(values);
  useLayoutEffect(() => {
    latest.current = values;
  }, [values]);
  const set = (patch: Values) => {
    latest.current = { ...latest.current, ...patch };
    onChange(latest.current);
  };
  const [notes, setNotes] = useState<Record<string, { text: string; tone: "info" | "error" }>>({});
  const note = (name: string, text: string | null, tone: "info" | "error" = "info") =>
    setNotes((all) => {
      const next = { ...all };
      if (text) next[name] = { text, tone };
      else delete next[name];
      return next;
    });

  return (
    <form
      id={formId}
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", touched && "[&_:invalid]:border-red-500")}
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (e.currentTarget.checkValidity()) onSubmit();
      }}
      onInvalid={() => setTouched(true)}
    >
      {visible.map((field) => (
        <div key={field.name} className={cn((field.wide || field.type === "items") && "sm:col-span-2", field.type === "checkbox" && "self-end")}>
          {field.type === "checkbox" ? (
            <label className="flex items-center gap-3 py-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                className="size-4 accent-brand-600"
                checked={Boolean(values[field.name])}
                disabled={isEditing && !isManager && field.lockedAfterCreate}
                onChange={(e) => set({ [field.name]: e.target.checked })}
              />
              {field.label}
            </label>
          ) : (
            <>
              <label htmlFor={`${formId}-${field.name}`} className={labelClasses}>
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </label>
              <FieldInput
                id={`${formId}-${field.name}`}
                field={field}
                values={values}
                disabled={isEditing && !isManager && field.lockedAfterCreate}
                set={set}
                note={note}
              />
            </>
          )}
          {notes[field.name] ? (
            <p role="status" className={cn("mt-1 text-xs", notes[field.name].tone === "error" ? "text-red-600" : "text-emerald-700 dark:text-emerald-300")}>
              {notes[field.name].text}
            </p>
          ) : (
            field.help && <p className="mt-1 text-xs text-subtle">{field.help}</p>
          )}
        </div>
      ))}
    </form>
  );
}

function FieldInput({
  id,
  field,
  values,
  disabled,
  set,
  note,
}: {
  id: string;
  field: FieldDefinition;
  values: Values;
  disabled?: boolean;
  set: (p: Values) => void;
  note: (name: string, text: string | null, tone?: "info" | "error") => void;
}) {
  const settings = useSettings();
  const raw = values[field.name];
  const value = raw === null || raw === undefined ? "" : String(raw);
  const common = { id, name: field.name, required: field.required, disabled, placeholder: field.placeholder, className: inputClasses };

  switch (field.type) {
    case "textarea":
      return <textarea {...common} rows={3} value={value} onChange={(e) => set({ [field.name]: e.target.value })} />;
    case "select": {
      let options = [...optionsFor(field, settings)];
      if (field.formValues) options = options.filter((o) => field.formValues!.includes(o.value) || o.value === value);
      // Keep an old value visible even if it was removed from the list.
      if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: value });
      return (
        <select {...common} value={value} onChange={(e) => set({ [field.name]: e.target.value })}>
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case "multiselect": {
      const picked = asList(raw);
      const options = [...optionsFor(field, settings)];
      for (const v of picked) if (!options.some((o) => o.value === v)) options.push({ value: v, label: v });
      const toggle = (v: string) => set({ [field.name]: picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v] });
      return (
        <div id={id} role="group" aria-label={field.label} className="flex flex-wrap gap-2 pt-0.5">
          {options.map((o) => {
            const on = picked.includes(o.value);
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
          {!options.length && <p className="text-sm text-subtle">No options yet. Add them in Settings → Lists.</p>}
        </div>
      );
    }
    case "reference":
      return (
        <ReferenceSelect
          id={id}
          field={field}
          value={value}
          label={String(values[`${field.name}Label`] ?? "")}
          disabled={disabled}
          onChange={async (v, label, picked) => {
            set({ [field.name]: v, [`${field.name}Label`]: v ? label : "" });
            note(field.name, null);
            if (!field.fill || !picked) return;
            note(field.name, "Filling in the form…");
            try {
              const { values: filled, note: text } = await field.fill(picked, values);
              set(filled);
              note(field.name, text ?? "Filled in. Check the details before saving.");
            } catch {
              note(field.name, "Couldn't fill the form from this record. Fill it in by hand.", "error");
            }
          }}
        />
      );
    case "references":
      return (
        <ReferenceChips
          id={id}
          field={field}
          value={asList(raw)}
          labels={asList(values[`${field.name}Label`])}
          disabled={disabled}
          onChange={(ids, labels) => set({ [field.name]: ids, [`${field.name}Label`]: labels })}
        />
      );
    case "items":
      return <LineItemsEditor value={Array.isArray(raw) ? raw : []} onChange={(items) => set({ [field.name]: items })} />;
    case "number":
    case "currency":
    case "percent":
      return (
        <input
          {...common}
          type="number"
          inputMode="decimal"
          step="any"
          min={field.min}
          max={field.max}
          value={value}
          onChange={(e) => set({ [field.name]: e.target.value })}
        />
      );
    default:
      return <input {...common} type={field.type} value={value} onChange={(e) => set({ [field.name]: e.target.value })} />;
  }
}
