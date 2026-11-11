import type { LucideIcon } from "lucide-react";
import type { Tone } from "@/components/ui/Badge";
import type { ModuleKey, Role } from "@/config/roles";
import type { BaseRecord, UserProfile } from "@/types";

export interface SelectOption {
  value: string;
  label: string;
  /** Badge colour when shown in a table. */
  tone?: Tone;
}

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "time"
  | "textarea"
  | "select"
  | "reference";

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** Options for "select" fields. */
  options?: SelectOption[];
  /** For "reference" fields: which module to pick from and which field to show. The label is saved as `<name>Label`. */
  reference?: { module: ModuleKey; labelField: string };
  /** Value for new records. Functions run when the form opens. */
  defaultValue?: string | number | (() => string | number);
  /** Only people who manage every record (e.g. HR for leave) can set this, like an approval status. */
  managerOnly?: boolean;
  /** People who only manage their own records can set this when creating, but not change it afterwards. */
  lockedAfterCreate?: boolean;
  /** Worked out in `beforeSave`, so not shown in the form. */
  computed?: boolean;
  /** Hidden from these roles in tables and forms. */
  hiddenFor?: Role[];
  /** How a number is shown in tables. */
  display?: "progress";
  min?: number;
  max?: number;
  /** Takes the full row in the two-column form. */
  wide?: boolean;
}

export interface ActionContext {
  profile: UserProfile;
}

export interface RecordAction {
  label: string;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "danger";
  /** Shown only when this returns true for the record. */
  when: (record: BaseRecord) => boolean;
  /** Who may use it: people who can edit every record ("manager") or anyone who can edit it ("editor"). */
  requires?: "manager" | "editor";
  /** Simple field changes to save. */
  patch?: (record: BaseRecord, ctx: ActionContext) => Record<string, unknown>;
  /** Or a custom handler for anything more involved. */
  run?: (record: BaseRecord, ctx: ActionContext) => Promise<void>;
  confirm?: string;
}

export interface ModuleDefinition {
  key: ModuleKey;
  /** Plural name, used for the page title and menu. */
  title: string;
  /** Name of one record, e.g. "Lead". */
  singular: string;
  description: string;
  icon: LucideIcon;
  href: string;
  fields: FieldDefinition[];
  /** Field names shown as table columns, in order. */
  columns: string[];
  /** Fields matched by the search box. */
  searchFields: string[];
  /** Select field used for the status filter chips. */
  statusField?: string;
  /** Column heading for the record owner, shown to people who see everyone's records (e.g. "Employee"). */
  ownerLabel?: string;
  actions?: RecordAction[];
  /** People who manage only their own records can edit or delete one only while this is true (e.g. leave still pending). */
  ownerEditableWhen?: (record: BaseRecord) => boolean;
  /** Fill in computed fields before saving. */
  beforeSave?: (data: Record<string, unknown>) => Record<string, unknown>;
}
