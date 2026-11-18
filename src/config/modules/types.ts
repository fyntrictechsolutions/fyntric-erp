import type { LucideIcon } from "lucide-react";
import type { Settings } from "@/components/settings/SettingsProvider";
import type { Tone } from "@/components/ui/Badge";
import type { ModuleKey, Role } from "@/config/roles";
import type { ListKey } from "@/config/settingsDefaults";
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
  | "checkbox"
  | "reference"
  | "items";

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** Fixed options for "select" fields (statuses and other workflow values). */
  options?: SelectOption[];
  /** Options come from an admin-editable list in Settings > Lists instead. */
  list?: ListKey;
  /** For "reference" fields: which module to pick from and which field to show. The label is saved as `<name>Label`. */
  reference?: { module: ModuleKey; labelField: string };
  /** Value for new records. Functions run when the form opens. */
  defaultValue?: string | number | boolean | ((ctx: FormContext) => string | number | boolean);
  /** Only people who manage every record (e.g. HR for leave) can set this, like an approval status. */
  managerOnly?: boolean;
  /** People who only manage their own records can set this when creating, but not change it afterwards. */
  lockedAfterCreate?: boolean;
  /** Worked out in `beforeSave`, so not shown in the form. */
  computed?: boolean;
  /** Set by the page that opens the form (e.g. the lead a follow-up belongs to), so not shown. */
  hidden?: boolean;
  /** Shown in the form only when this returns true for the values being edited. */
  showWhen?: (values: Record<string, unknown>) => boolean;
  /** Hidden from these roles in tables and forms. */
  hiddenFor?: Role[];
  /** How a number is shown in tables. */
  display?: "progress" | "billingGroups";
  /** Select fields: only these values can be picked in the form (others still show as badges, e.g. statuses set automatically). */
  formValues?: string[];
  /** In tables, long values keep their start and end with "…" in the middle (full value on hover). */
  shortenMiddle?: boolean;
  min?: number;
  max?: number;
  /** Takes the full row in the two-column form. */
  wide?: boolean;
}

/** One row of an "items" field (estimate lines). */
export interface LineItem {
  productId?: string;
  name: string;
  description?: string;
  qty: number;
  unit?: string;
  rate: number;
  taxRate: number;
  /** Before tax. */
  amount: number;
  /** One-time charge, or billed every month or year. Missing on older lines: see billingOf(). */
  billing?: Billing;
}

export type Billing = "once" | "annually" | "monthly";

export interface FormContext {
  settings: Settings;
}

export interface ActionContext {
  profile: UserProfile;
  settings: Settings;
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

/** Several fields stacked in one table column: the first on top, the rest smaller underneath. */
export interface ColumnGroup {
  label: string;
  fields: string[];
  /** Text shown before a field's value on its line, e.g. { taxRate: "+ GST " }. */
  prefixes?: Record<string, string>;
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
  columns: (string | ColumnGroup)[];
  /** Fields matched by the search box. */
  searchFields: string[];
  /** Select field used for the status filter chips. */
  statusField?: string;
  /** Column heading for the record owner, shown to people who see everyone's records (e.g. "Employee"). */
  ownerLabel?: string;
  actions?: RecordAction[];
  /** People who manage only their own records can edit or delete one only while this is true (e.g. leave still pending). */
  ownerEditableWhen?: (record: BaseRecord) => boolean;
  /** Records are created elsewhere (e.g. employees on approval), so the page has no "New" button. */
  noManualCreate?: boolean;
  /** The list page always shows the signed-in user's own records, whatever their role (e.g. My Attendance). */
  ownRecordsOnly?: boolean;
  /** Only people who can edit every record get Edit / Delete buttons (owners can't edit their own). */
  managersEditOnly?: boolean;
  /** Clicking a row opens this page. */
  detailHref?: (id: string) => string;
  /** Checks the form before saving; return a message to stop the save. `record` is the saved version when editing. */
  validate?: (values: Record<string, unknown>, record?: BaseRecord) => string | null | Promise<string | null>;
  /** Fill in computed fields before saving. */
  beforeSave?: (data: Record<string, unknown>, ctx: FormContext) => Record<string, unknown>;
  /** Runs after a new record is saved (e.g. schedule a lead's first call). */
  afterCreate?: (id: string, data: Record<string, unknown>, ctx: ActionContext) => Promise<void>;
  /** Runs after a record is created, edited or deleted (e.g. update an invoice's paid amount). */
  afterChange?: (data: Record<string, unknown>, ctx: ActionContext) => Promise<void>;
  /** Runs after a record is deleted (e.g. remove a lead's follow-ups). */
  afterDelete?: (record: BaseRecord, ctx: ActionContext) => Promise<void>;
}
