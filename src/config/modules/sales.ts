import { CalendarClock, Check, FileSignature, Package, Send } from "lucide-react";
import { todayISO } from "@/lib/format";
import { BILLING_GROUPS, DISCOUNT_FIELDS, discountsOf, groupedTotals, groupFields, hasBilling } from "@/lib/lineItems";
import { ACTIVE_STATUS, addDays, BILLING_CYCLES, docNumber } from "./options";
import type { FieldDefinition, LineItem, ModuleDefinition, SelectOption } from "./types";

export const FOLLOWUP_STATUS: SelectOption[] = [
  { value: "scheduled", label: "Scheduled", tone: "blue" },
  { value: "done", label: "Done", tone: "green" },
  { value: "missed", label: "Missed", tone: "red" },
  { value: "rescheduled", label: "Rescheduled", tone: "amber" },
];

/** Follow-ups live on the lead details page; this definition drives their form. */
export const followupsModule: ModuleDefinition = {
  key: "followups",
  title: "Follow-ups",
  singular: "Follow-up",
  description: "Calls and meetings with a lead.",
  icon: CalendarClock,
  href: "/crm/leads",
  statusField: "status",
  searchFields: ["goal", "summary", "leadIdLabel"],
  columns: ["date", "time", "mode", "goal", "status"],
  fields: [
    { name: "leadId", label: "Lead", type: "reference", hidden: true, reference: { module: "leads", labelField: "name" } },
    { name: "date", label: "Date", type: "date", required: true, defaultValue: () => todayISO() },
    { name: "time", label: "Time", type: "time", required: true },
    { name: "mode", label: "Mode", type: "select", required: true, list: "followupModes" },
    { name: "goal", label: "Goal", type: "text", required: true, placeholder: "e.g. Walk through the estimate" },
    { name: "status", label: "Status", type: "select", defaultValue: "scheduled", options: FOLLOWUP_STATUS },
    { name: "points", label: "Points to discuss", type: "textarea", wide: true, showWhen: (v) => !v.isFirstCall },
    { name: "summary", label: "Summary of discussion", type: "textarea", wide: true, help: "Fill this in after the call." },
    { name: "isFirstCall", label: "First call", type: "checkbox", hidden: true },
  ],
};

export const productsModule: ModuleDefinition = {
  key: "products",
  title: "Products & services",
  singular: "Product or service",
  description: "Your price list. Items here can be picked when you build an estimate.",
  icon: Package,
  href: "/crm/products",
  statusField: "status",
  searchFields: ["name", "category", "code", "description"],
  columns: [{ label: "Product / service", fields: ["name", "kind", "category"] }, { label: "Price", fields: ["price", "taxRate"], prefixes: { taxRate: "+ GST " } }, "billingCycle", "status"],
  fields: [
    { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Business website (up to 8 pages)" },
    {
      name: "kind",
      label: "Type",
      type: "select",
      required: true,
      defaultValue: "service",
      options: [
        { value: "service", label: "Service", tone: "violet" },
        { value: "product", label: "Product", tone: "blue" },
      ],
    },
    { name: "category", label: "Category", type: "select", list: "productCategories" },
    { name: "code", label: "HSN / SAC code", type: "text", placeholder: "998314" },
    { name: "price", label: "Price (before GST)", type: "currency", required: true, min: 0 },
    { name: "unit", label: "Unit", type: "select", list: "units", defaultValue: "Nos" },
    { name: "taxRate", label: "GST (%)", type: "percent", min: 0, max: 100, defaultValue: ({ settings }) => settings.app.defaultTaxRate },
    { name: "status", label: "Status", type: "select", defaultValue: "active", options: ACTIVE_STATUS },
    { name: "isSubscription", label: "Subscription (recurring billing)", type: "checkbox" },
    { name: "billingCycle", label: "Billing cycle", type: "select", required: true, defaultValue: "monthly", options: BILLING_CYCLES, showWhen: (v) => Boolean(v.isSubscription) },
    { name: "description", label: "Description / what's included", type: "textarea", wide: true },
  ],
  beforeSave: (data) => ({ ...data, billingCycle: data.isSubscription ? data.billingCycle : null }),
};

export const ESTIMATE_STATUS: SelectOption[] = [
  { value: "draft", label: "Draft", tone: "neutral" },
  { value: "sent", label: "Sent", tone: "blue" },
  { value: "revision", label: "Revision requested", tone: "amber" },
  { value: "approved", label: "Approved", tone: "green" },
  { value: "rejected", label: "Rejected", tone: "red" },
  { value: "expired", label: "Expired", tone: "violet" },
];

export const estimatesModule: ModuleDefinition = {
  key: "estimates",
  title: "Estimates",
  singular: "Estimate",
  description: "Quotations sent to leads, with their approval status.",
  icon: FileSignature,
  href: "/crm/estimates",
  detailHref: (id) => `/crm/estimates/view?id=${id}`,
  statusField: "status",
  searchFields: ["estimateNumber", "leadIdLabel", "title"],
  columns: ["estimateNumber", "leadId", "title", "issueDate", "total", "status"],
  fields: [
    { name: "leadId", label: "Lead", type: "reference", required: true, reference: { module: "leads", labelField: "name" } },
    { name: "title", label: "Title", type: "text", placeholder: "e.g. Website redesign" },
    { name: "estimateNumber", label: "Estimate no.", type: "text", shortenMiddle: true, help: "Leave blank to generate one." },
    { name: "issueDate", label: "Date", type: "date", required: true, defaultValue: () => todayISO() },
    { name: "validUntil", label: "Valid until", type: "date", defaultValue: ({ settings }) => addDays(todayISO(), settings.app.estimateValidityDays) },
    { name: "status", label: "Status", type: "select", required: true, defaultValue: "draft", options: ESTIMATE_STATUS },
    { name: "items", label: "Items", type: "items", required: true },
    // One discount per kind of charge, each shown once there's a line of that kind.
    ...BILLING_GROUPS.map(
      (g): FieldDefinition => ({
        name: DISCOUNT_FIELDS[g.key],
        label: `Discount on ${g.key === "once" ? "one-time total" : g.key === "annually" ? "annual recurring" : "monthly recurring"} (₹)`,
        type: "currency",
        min: 0,
        help: g.key === "once" ? "Before GST." : `Before GST, off each ${g.key === "annually" ? "year's" : "month's"} charge.`,
        showWhen: (v) => hasBilling(v.items, g.key),
      }),
    ),
    { name: "discount", label: "Discount", type: "currency", computed: true },
    { name: "subtotal", label: "Subtotal", type: "currency", computed: true },
    { name: "taxTotal", label: "GST", type: "currency", computed: true },
    { name: "total", label: "Amount", type: "currency", computed: true, display: "billingGroups" },
    { name: "notes", label: "Notes for the client", type: "textarea", wide: true },
    { name: "terms", label: "Terms", type: "textarea", wide: true, defaultValue: ({ settings }) => settings.app.estimateTerms },
  ],
  // Older estimates had one discount, taken off the first group: show it in that group's box.
  toForm: (record) => {
    const legacy = discountsOf(record);
    if (legacy !== null && typeof legacy === "object") return record;
    const first = groupedTotals(record.items as LineItem[] | undefined)[0];
    return first && Number(legacy) ? { ...record, [DISCOUNT_FIELDS[first.key]]: legacy } : record;
  },
  validate: (v) => (Array.isArray(v.items) && v.items.length ? null : "Add at least one item."),
  beforeSave: (data, { settings }) => {
    const items = (data.items as LineItem[] | undefined) ?? [];
    // A discount on a kind of charge the estimate no longer has is dropped.
    for (const g of BILLING_GROUPS) if (!hasBilling(items, g.key) || !Number(data[DISCOUNT_FIELDS[g.key]])) data[DISCOUNT_FIELDS[g.key]] = null;
    const groups = groupedTotals(items, Object.fromEntries(BILLING_GROUPS.map((g) => [g.key, data[DISCOUNT_FIELDS[g.key]]])));
    const sum = (k: "subtotal" | "discount" | "taxTotal" | "total") => Math.round(groups.reduce((t, g) => t + g[k], 0) * 100) / 100;
    return {
      ...data,
      estimateNumber: (data.estimateNumber as string)?.trim() || docNumber(settings.business.estimatePrefix),
      // Sums across groups are kept for reports (pipeline value); the estimate itself shows each group on its own.
      subtotal: sum("subtotal"),
      discount: sum("discount") || null,
      taxTotal: sum("taxTotal"),
      total: sum("total"),
      ...groupFields(groups),
    };
  },
  actions: [
    { label: "Mark sent", icon: Send, requires: "editor", when: (r) => r.status === "draft" || r.status === "revision", patch: () => ({ status: "sent", sentAt: Date.now() }) },
    { label: "Approved", icon: Check, requires: "editor", when: (r) => r.status === "sent", patch: () => ({ status: "approved" }) },
  ],
};
