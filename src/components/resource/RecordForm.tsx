"use client";

import { useState } from "react";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import type { FieldDefinition, ModuleDefinition } from "@/config/modules";
import type { Role } from "@/config/roles";
import { cn } from "@/lib/cn";
import type { BaseRecord } from "@/types";
import { ReferenceSelect } from "./ReferenceSelect";

type Values = Record<string, unknown>;

/** Initial form values: the record being edited, or each field's default for a new one. */
export function initialValues(module: ModuleDefinition, record?: BaseRecord | null): Values {
  if (record) return { ...record };
  const values: Values = {};
  for (const f of module.fields) {
    if (f.defaultValue === undefined) continue;
    values[f.name] = typeof f.defaultValue === "function" ? f.defaultValue() : f.defaultValue;
  }
  return values;
}

/** Turns form strings into stored values (numbers for numeric fields, "" for cleared values becomes null). */
export function toStoredValues(module: ModuleDefinition, values: Values): Values {
  const out: Values = { ...values };
  for (const f of module.fields) {
    const v = out[f.name];
    if (["number", "currency", "percent"].includes(f.type)) {
      out[f.name] = v === "" || v === undefined || v === null ? null : Number(v);
    } else if (v === "") {
      out[f.name] = null;
    }
  }
  return module.beforeSave ? module.beforeSave(out) : out;
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
  const visible = module.fields.filter(
    (f) => !f.computed && !(f.managerOnly && !isManager) && !f.hiddenFor?.includes(role),
  );
  const set = (patch: Values) => onChange({ ...values, ...patch });

  return (
    <form
      id={formId}
      noValidate={false}
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", touched && "[&_:invalid]:border-red-500")}
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (e.currentTarget.checkValidity()) onSubmit();
      }}
      onInvalid={() => setTouched(true)}
    >
      {visible.map((field) => (
        <div key={field.name} className={cn(field.wide && "sm:col-span-2")}>
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
          />
          {field.help && <p className="mt-1 text-xs text-subtle">{field.help}</p>}
        </div>
      ))}
    </form>
  );
}

function FieldInput({ id, field, values, disabled, set }: { id: string; field: FieldDefinition; values: Values; disabled?: boolean; set: (p: Values) => void }) {
  const raw = values[field.name];
  const value = raw === null || raw === undefined ? "" : String(raw);
  const common = { id, name: field.name, required: field.required, disabled, placeholder: field.placeholder, className: inputClasses };

  switch (field.type) {
    case "textarea":
      return <textarea {...common} rows={3} value={value} onChange={(e) => set({ [field.name]: e.target.value })} />;
    case "select":
      return (
        <select {...common} value={value} onChange={(e) => set({ [field.name]: e.target.value })}>
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "reference":
      return (
        <ReferenceSelect
          id={id}
          field={field}
          value={value}
          label={String(values[`${field.name}Label`] ?? "")}
          disabled={disabled}
          onChange={(v, label) => set({ [field.name]: v, [`${field.name}Label`]: v ? label : "" })}
        />
      );
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
