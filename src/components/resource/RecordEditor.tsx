"use client";

import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ModuleDefinition } from "@/config/modules";
import type { Role } from "@/config/roles";
import { moduleAccess } from "@/lib/access";
import { db } from "@/lib/firebase";
import { createRecord, updateRecord } from "@/lib/records";
import type { BaseRecord } from "@/types";
import { initialValues, RecordForm, toStoredValues } from "./RecordForm";

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("permission") || msg.includes("PERMISSION_DENIED")) return "You don't have permission to do that.";
  return msg;
}

interface RecordEditorProps {
  module: ModuleDefinition;
  /** The record to edit, or null to create a new one. */
  record: BaseRecord | null;
  /** Values set by the opening page for a new record (e.g. the lead a follow-up belongs to). */
  preset?: Record<string, unknown>;
  title?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

/** Create / edit drawer for one record of any module. Mount it when needed, unmount to close. */
export function RecordEditor({ module, record, preset, title, onClose, onSaved }: RecordEditorProps) {
  const profile = useProfile();
  const settings = useSettings();
  const access = moduleAccess(module, profile);
  const [values, setValues] = useState(() => initialValues(module, { settings, profile }, record, preset));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const formId = `form-${module.key}`;
  const [filledNote, setFilledNote] = useState<string | null>(null);

  // A new record opened with a reference already picked (e.g. from a link) fills in from it, as picking it would.
  useEffect(() => {
    if (record || !preset) return;
    const field = module.fields.find((f) => f.fill && f.reference && f.reference.module !== "team" && f.reference.module !== "managers" && typeof preset[f.name] === "string" && preset[f.name]);
    if (!field) return;
    let live = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db(), field.reference!.module, String(preset[field.name])));
        if (!snap.exists() || !live) return;
        const picked = { id: snap.id, ...snap.data() } as BaseRecord;
        const ref = field.reference!;
        const label = ref.format ? ref.format(picked) : String(picked[ref.labelField] ?? "");
        const { values: filled, note } = await field.fill!(picked, {});
        if (!live) return;
        setValues((v) => ({ ...v, [`${field.name}Label`]: label, ...filled }));
        setFilledNote(note ?? null);
      } catch {
        if (live) setFilledNote("Couldn't fill the form in. Fill it in by hand.");
      }
    })();
    return () => {
      live = false;
    };
  }, [module, record, preset]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const problem = await module.validate?.(values, record ?? undefined);
      if (problem) {
        setMessage(problem);
        return;
      }
      const stored = toStoredValues(module, values, { settings, profile });
      // Create-only answers go to afterCreate, not onto the record.
      const extra: Record<string, unknown> = {};
      for (const f of module.fields)
        if (f.createOnly) {
          extra[f.name] = stored[f.name];
          delete stored[f.name];
        }
      let id = record?.id ?? "";
      if (record) {
        await updateRecord(module.key, record.id, stored);
      } else {
        const ref = await createRecord(module.key, stored, profile);
        id = ref.id;
        await module.afterCreate?.(id, { ...stored, ...extra }, { profile, settings });
      }
      await module.afterChange?.({ ...record, ...stored }, { profile, settings });
      onSaved?.(id);
      onClose();
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={title ?? (record ? `Edit ${module.singular.toLowerCase()}` : `New ${module.singular.toLowerCase()}`)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? "Saving…" : record ? "Save changes" : `Add ${module.singular.toLowerCase()}`}
          </Button>
        </>
      }
    >
      {message && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}
      {filledNote && <p role="status" className="mb-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">{filledNote}</p>}
      <RecordForm
        formId={formId}
        module={module}
        values={values}
        onChange={setValues}
        onSubmit={save}
        role={profile.role as Role}
        isManager={access.isManager}
        isEditing={Boolean(record)}
      />
    </Modal>
  );
}
