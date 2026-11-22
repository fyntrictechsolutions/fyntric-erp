import { Check, FileText, HandCoins, Pause, Play, Receipt, Repeat, Square, Wallet, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import { recalcPaid } from "@/lib/payments";
import { discountedTotals, discountsOf, groupedTotals } from "@/lib/lineItems";
import { createRecord, updateRecord } from "@/lib/records";
import { linesForPeriod, nextDueAfter, periodLabel, type Frequency } from "@/lib/recurring";
import { docNumber } from "./options";
import type { FieldDefinition, LineItem, ModuleDefinition, SelectOption } from "./types";

/** Recurring lines an estimate's invoice left out, ready to become billing schedules. */
interface PendingGroup {
  frequency: Frequency;
  items: LineItem[];
  discount: number;
}

const perLabel = (f: Frequency) => (f === "monthly" ? "a month" : "a year");

/**
 * Optional first step of a new invoice: pick a saved estimate to copy its one-time items, their discount and
 * notes, and the client the estimate's lead was converted to. Yearly and monthly lines (AMC, hosting) aren't
 * billed today: they can go to Recurring billing instead, from a date you pick. Everything stays editable.
 */
const fromEstimate: FieldDefinition = {
  name: "estimateId",
  label: "Fill from estimate (optional)",
  type: "reference",
  wide: true,
  showWhen: (v) => !v.recurringId,
  reference: {
    module: "estimates",
    labelField: "estimateNumber",
    format: (e) => [e.estimateNumber || "Estimate", e.leadIdLabel, e.title].filter(Boolean).map(String).join(" · "),
  },
  help: "Pick a saved estimate to fill in the invoice, then change anything you need. Or leave it blank and fill in every field yourself.",
  fill: async (estimate) => {
    const groups = groupedTotals(estimate.items as LineItem[] | undefined, discountsOf(estimate));
    const once = groups.find((g) => g.key === "once");
    const pending: PendingGroup[] = groups
      .filter((g) => g.key !== "once")
      .map((g) => ({ frequency: g.key as Frequency, items: g.items.map((x) => ({ ...x.item })), discount: g.discount }));
    const values: Record<string, unknown> = {
      items: once ? once.items.map((x) => ({ ...x.item })) : [],
      discount: once?.discount || "",
      notes: estimate.notes ?? "",
      pendingRecurring: pending,
      scheduleRecurring: pending.length > 0,
    };
    const number = String(estimate.estimateNumber || "the estimate");
    const left = pending.flatMap((g) => g.items.map((it) => `${it.name} (${formatCurrency(it.amount)} + GST ${perLabel(g.frequency)})`));
    const parts = [
      once ? `Filled in the one-time charges from ${number}.` : `${number} has no one-time charges, so add this invoice's items yourself.`,
      left.length ? `Not billed today: ${left.join(", ")}. Tick below to add ${left.length === 1 ? "it" : "them"} to Recurring billing.` : "",
    ];
    const leadId = estimate.leadId as string | undefined;
    const lead = leadId ? await getDoc(doc(db(), "leads", leadId)).catch(() => null) : null;
    const clientId = lead?.exists() ? (lead.get("clientId") as string | undefined) : undefined;
    if (clientId) {
      values.clientId = clientId;
      values.clientIdLabel = lead!.get("clientIdLabel") ?? "";
      parts.push("Check the details before saving.");
    } else {
      parts.push(`${String(estimate.leadIdLabel || "This lead")} isn't a client yet, so pick the client below (or convert the lead first).`);
    }
    return { values, note: parts.filter(Boolean).join(" ") };
  },
};

/** Or: the next period of a recurring charge. Saving the invoice moves the charge's next billing date on. */
const fromRecurring: FieldDefinition = {
  name: "recurringId",
  label: "Bill a recurring charge (optional)",
  type: "reference",
  wide: true,
  showWhen: (v) => !v.estimateId,
  reference: {
    module: "recurring",
    labelField: "title",
    format: (r) => [r.title || "Recurring charge", r.clientIdLabel, r.nextDue ? `due ${formatDate(r.nextDue)}` : ""].filter(Boolean).map(String).join(" · "),
  },
  help: "For AMC, hosting and other charges billed every year or month. They're set up in Finance → Recurring billing.",
  fill: async (r) => {
    const start = String(r.nextDue || todayISO());
    return {
      values: {
        items: linesForPeriod(r.items as LineItem[] | undefined, start, r.frequency),
        discount: r.discount ?? "",
        clientId: r.clientId ?? "",
        clientIdLabel: r.clientIdLabel ?? "",
        projectId: r.projectId ?? "",
        projectIdLabel: r.projectIdLabel ?? "",
        recurringPeriodStart: start,
      },
      note: `Filled in for ${String(r.title || "this charge")}, ${periodLabel(start, r.frequency)}. Saving the invoice moves the next billing date to ${formatDate(nextDueAfter(start, r.frequency))}.`,
    };
  },
};

const hasPending = (v: Record<string, unknown>) => Boolean(v.estimateId) && Array.isArray(v.pendingRecurring) && v.pendingRecurring.length > 0;

/** Asked when an estimate had recurring lines: whether to schedule them, and from when. Not saved on the invoice. */
const scheduleFields: FieldDefinition[] = [
  { name: "pendingRecurring", label: "Recurring lines", type: "text", hidden: true, createOnly: true },
  {
    name: "scheduleRecurring",
    label: "Add the recurring charges to Recurring billing, so the app reminds me when they're due",
    type: "checkbox",
    wide: true,
    createOnly: true,
    showWhen: hasPending,
  },
  {
    name: "recurringFirstDue",
    label: "First billing date for the recurring charges",
    type: "date",
    required: true,
    createOnly: true,
    showWhen: (v) => hasPending(v) && Boolean(v.scheduleRecurring),
    help: "When the first recurring invoice should go out, e.g. a year after the work is delivered. The dashboard reminds you two weeks before.",
  },
];

const hasItems = (v: Record<string, unknown>) => Array.isArray(v.items) && v.items.length > 0;
/** An invoice from before line items: it has an amount but no items. */
const isLegacy = (v: Record<string, unknown>) => !hasItems(v) && v.amount !== undefined && v.amount !== null && v.amount !== "";

export const invoicesModule: ModuleDefinition = {
  key: "invoices",
  title: "Invoices",
  singular: "Invoice",
  description: "Bills raised to clients, with GST and payment status.",
  icon: FileText,
  href: "/finance/invoices",
  detailHref: (id) => `/finance/invoices/view?id=${id}`,
  statusField: "status",
  searchFields: ["invoiceNumber", "clientIdLabel", "projectIdLabel"],
  columns: ["invoiceNumber", "clientId", "issueDate", "dueDate", "total", "balance", "status"],
  fields: [
    fromEstimate,
    fromRecurring,
    { name: "recurringPeriodStart", label: "Period starts", type: "date", hidden: true },
    { name: "invoiceNumber", label: "Invoice number", type: "text", help: "Leave blank to generate one." },
    { name: "clientId", label: "Client", type: "reference", required: true, reference: { module: "clients", labelField: "name" } },
    { name: "projectId", label: "Project", type: "reference", reference: { module: "projects", labelField: "name" } },
    { name: "issueDate", label: "Issue date", type: "date", required: true, defaultValue: todayISO },
    { name: "dueDate", label: "Due date", type: "date" },
    { name: "items", label: "Items", type: "items", wide: true },
    { name: "discount", label: "Discount (₹, before GST)", type: "currency", min: 0, showWhen: hasItems },
    // Invoices made before line items existed keep a single amount and GST rate.
    { name: "amount", label: "Amount (before GST)", type: "currency", min: 0, showWhen: isLegacy },
    { name: "taxRate", label: "GST (%)", type: "percent", min: 0, max: 100, showWhen: isLegacy },
    { name: "taxTotal", label: "GST", type: "currency", computed: true },
    { name: "total", label: "Total", type: "currency", computed: true },
    { name: "amountPaid", label: "Paid", type: "currency", computed: true },
    { name: "balance", label: "Balance due", type: "currency", computed: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: "draft",
      // Paid and part paid come from the payments recorded against the invoice.
      formValues: ["draft", "sent", "overdue", "cancelled"],
      help: "Paid / part paid is set automatically when you record a payment.",
      options: [
        { value: "draft", label: "Draft", tone: "neutral" },
        { value: "sent", label: "Sent", tone: "blue" },
        { value: "partial", label: "Part paid", tone: "violet" },
        { value: "paid", label: "Paid", tone: "green" },
        { value: "overdue", label: "Overdue", tone: "red" },
        { value: "cancelled", label: "Cancelled", tone: "neutral" },
      ],
    },
    { name: "paidDate", label: "Paid on", type: "date", computed: true },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
    ...scheduleFields,
  ],
  validate: (v) => (hasItems(v) || isLegacy(v) ? null : "Add at least one item."),
  beforeSave: (data, { settings }) => {
    const items = (data.items as LineItem[] | undefined) ?? [];
    let amount: number;
    let taxTotal: number;
    let total: number;
    let discount: number | null = null;
    if (items.length) {
      const t = discountedTotals(items, data.discount);
      amount = t.taxable;
      taxTotal = t.taxTotal;
      total = t.total;
      discount = t.discount || null;
    } else {
      amount = Number(data.amount) || 0;
      total = Math.round(amount * (1 + (Number(data.taxRate) || 0) / 100) * 100) / 100;
      taxTotal = Math.round((total - amount) * 100) / 100;
    }
    const paid = Number(data.amountPaid) || 0;
    const balance = Math.round((total - paid) * 100) / 100;
    // With payments recorded, the status follows them (e.g. after the invoice total is edited).
    let status = data.status;
    if (paid > 0 && status !== "cancelled") status = balance <= 0 ? "paid" : "partial";
    return {
      ...data,
      invoiceNumber: (data.invoiceNumber as string)?.trim() || docNumber(settings.business.invoicePrefix),
      items,
      discount,
      // "amount" is always the taxable value before GST (reports rely on it).
      amount,
      taxRate: items.length ? null : data.taxRate,
      taxTotal,
      total,
      amountPaid: paid,
      balance,
      status,
    };
  },
  afterCreate: async (id, data, { profile, settings }) => {
    // Billed a period of a recurring charge: its next billing date moves one period on (once per period).
    const recurringId = data.recurringId as string | undefined;
    const start = data.recurringPeriodStart as string | undefined;
    if (recurringId && start) {
      const snap = await getDoc(doc(db(), "recurring", recurringId));
      if (snap.exists() && snap.get("nextDue") === start)
        await updateRecord("recurring", recurringId, {
          nextDue: nextDueAfter(start, snap.get("frequency")),
          lastInvoiceId: id,
          lastInvoiceNumber: data.invoiceNumber ?? null,
          lastBilledOn: todayISO(),
        });
    }
    // From an estimate with yearly / monthly lines: one schedule per frequency, from the date picked.
    const pending = data.pendingRecurring as PendingGroup[] | undefined;
    if (data.scheduleRecurring && data.recurringFirstDue && Array.isArray(pending)) {
      for (const g of pending) {
        if (!g.items?.length) continue;
        const values = recurringModule.beforeSave!(
          {
            title: g.items.map((it) => it.name).join(", "),
            clientId: data.clientId ?? null,
            clientIdLabel: data.clientIdLabel ?? null,
            projectId: data.projectId ?? null,
            projectIdLabel: data.projectIdLabel ?? null,
            frequency: g.frequency,
            nextDue: data.recurringFirstDue,
            items: g.items,
            discount: g.discount || null,
            status: "active",
            estimateId: data.estimateId ?? null,
            estimateIdLabel: data.estimateIdLabel ?? null,
            fromInvoiceId: id,
            fromInvoiceNumber: data.invoiceNumber ?? null,
          },
          { settings, profile },
        );
        await createRecord("recurring", values, profile);
      }
    }
  },
};

const FREQUENCIES: SelectOption[] = [
  { value: "annually", label: "Every year" },
  { value: "monthly", label: "Every month" },
];

/**
 * Charges billed every year or month (AMC, hosting, subscriptions). The app only reminds: when one is due,
 * Raise invoice opens a new invoice filled in for the period, and saving it moves the next billing date on.
 */
export const recurringModule: ModuleDefinition = {
  key: "recurring",
  title: "Recurring billing",
  singular: "Recurring charge",
  description: "AMC, hosting and other charges billed every year or month, with reminders when they're due.",
  icon: Repeat,
  href: "/finance/recurring",
  statusField: "status",
  searchFields: ["title", "clientIdLabel", "projectIdLabel", "estimateIdLabel"],
  columns: [{ label: "Charge", fields: ["title", "clientId"] }, "frequency", "total", "nextDue", { label: "Last invoice", fields: ["lastInvoiceNumber", "lastBilledOn"] }, "status"],
  fields: [
    { name: "title", label: "What's billed", type: "text", required: true, placeholder: "e.g. AMC support", wide: true },
    { name: "clientId", label: "Client", type: "reference", required: true, reference: { module: "clients", labelField: "name" } },
    { name: "projectId", label: "Project", type: "reference", reference: { module: "projects", labelField: "name" } },
    { name: "frequency", label: "Billed", type: "select", required: true, defaultValue: "annually", options: FREQUENCIES },
    {
      name: "nextDue",
      label: "Next billing date",
      type: "date",
      required: true,
      help: "When the next invoice should go out. The dashboard reminds you two weeks before.",
    },
    { name: "items", label: "Items billed each time", type: "items", wide: true },
    { name: "discount", label: "Discount each time (₹, before GST)", type: "currency", min: 0, showWhen: hasItems },
    { name: "amount", label: "Before GST", type: "currency", computed: true },
    { name: "taxTotal", label: "GST", type: "currency", computed: true },
    { name: "total", label: "Each time", type: "currency", computed: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: "active",
      options: [
        { value: "active", label: "Active", tone: "green" },
        { value: "paused", label: "Paused", tone: "amber" },
        { value: "ended", label: "Ended", tone: "neutral" },
      ],
      help: "Paused and ended charges don't remind you.",
    },
    { name: "lastInvoiceNumber", label: "Last invoice", type: "text", computed: true },
    { name: "lastBilledOn", label: "Billed on", type: "date", computed: true },
    { name: "estimateIdLabel", label: "From estimate", type: "text", computed: true },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  validate: (v) => (hasItems(v) ? null : "Add the items billed each time."),
  beforeSave: (data) => {
    const items = (data.items as LineItem[] | undefined) ?? [];
    const t = discountedTotals(items, data.discount);
    return { ...data, items, discount: t.discount || null, amount: t.taxable, taxTotal: t.taxTotal, total: t.total };
  },
  actions: [
    {
      label: "Raise invoice",
      icon: FileText,
      variant: "primary",
      requires: "editor",
      when: (r) => r.status === "active",
      href: (r) => `/finance/invoices?new=1&recurringId=${encodeURIComponent(r.id)}`,
    },
    { label: "Pause", icon: Pause, requires: "editor", when: (r) => r.status === "active", patch: () => ({ status: "paused" }) },
    { label: "Resume", icon: Play, requires: "editor", when: (r) => r.status === "paused", patch: () => ({ status: "active" }) },
    {
      label: "End",
      icon: Square,
      variant: "danger",
      requires: "editor",
      when: (r) => r.status !== "ended",
      confirm: "End this recurring charge? It stops reminding you. Invoices already raised stay as they are.",
      patch: () => ({ status: "ended" }),
    },
  ],
};

export const expensesModule: ModuleDefinition = {
  key: "expenses",
  title: "Expenses",
  singular: "Expense",
  description: "Company spending and staff reimbursement claims.",
  icon: Receipt,
  href: "/finance/expenses",
  ownerLabel: "Submitted by",
  statusField: "status",
  searchFields: ["description", "category", "userName", "paidByLabel", "projectIdLabel"],
  columns: ["date", "category", "description", "amount", "paidBy", "status"],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, defaultValue: todayISO },
    {
      name: "category",
      label: "Category",
      type: "select",
      required: true,
      list: "expenseCategories",
    },
    { name: "amount", label: "Amount", type: "currency", required: true, min: 0 },
    {
      name: "paidBy",
      label: "Paid by",
      type: "reference",
      reference: { module: "team", labelField: "displayName" },
      defaultToMe: true,
      help: "The team member who paid. Admins can pick anyone; others record what they paid themselves.",
    },
    {
      name: "paymentMode",
      label: "Payment mode",
      type: "select",
      defaultValue: "UPI",
      list: "paymentModes",
    },
    { name: "projectId", label: "Project (optional)", type: "reference", reference: { module: "projects", labelField: "name" } },
    { name: "description", label: "Description", type: "textarea", wide: true, required: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      managerOnly: true,
      defaultValue: "pending",
      options: [
        { value: "pending", label: "Pending", tone: "amber" },
        { value: "approved", label: "Approved", tone: "blue" },
        { value: "reimbursed", label: "Reimbursed", tone: "green" },
        { value: "rejected", label: "Rejected", tone: "red" },
      ],
    },
  ],
  ownerEditableWhen: (r) => r.status === "pending",
  actions: [
    { label: "Approve", icon: Check, requires: "manager", when: (r) => r.status === "pending", patch: () => ({ status: "approved" }) },
    { label: "Reject", icon: X, variant: "danger", requires: "manager", when: (r) => r.status === "pending", patch: () => ({ status: "rejected" }) },
    { label: "Mark reimbursed", icon: Wallet, requires: "manager", when: (r) => r.status === "approved", patch: () => ({ status: "reimbursed" }) },
  ],
};

export const PAYMENT_DIRECTION: SelectOption[] = [
  { value: "received", label: "Received", tone: "green" },
  { value: "paid", label: "Paid out", tone: "amber" },
];

/** Money in against invoices, money out against purchase bills. Saving one updates the bill or invoice balance. */
export const paymentsModule: ModuleDefinition = {
  key: "payments",
  title: "Payments",
  singular: "Payment",
  description: "Money received against invoices and paid against purchase bills.",
  icon: HandCoins,
  href: "/finance/payments",
  detailHref: (id) => `/finance/payments/view?id=${id}`,
  ownerLabel: "Recorded by",
  statusField: "direction",
  searchFields: ["receiptNumber", "against", "reference", "mode", "notes"],
  columns: ["date", "receiptNumber", "direction", "against", "amount", "mode", "reference"],
  fields: [
    { name: "direction", label: "Type", type: "select", required: true, defaultValue: "received", options: PAYMENT_DIRECTION, lockedAfterCreate: true, hiddenFor: ["sales"] },
    {
      name: "invoiceId",
      label: "Invoice",
      type: "reference",
      required: true,
      reference: { module: "invoices", labelField: "invoiceNumber" },
      showWhen: (v) => v.direction !== "paid",
    },
    {
      name: "billId",
      label: "Purchase bill",
      type: "reference",
      required: true,
      reference: { module: "purchases", labelField: "billNumber" },
      showWhen: (v) => v.direction === "paid",
    },
    { name: "date", label: "Date", type: "date", required: true, defaultValue: () => todayISO() },
    { name: "amount", label: "Amount", type: "currency", required: true, min: 0 },
    { name: "mode", label: "Mode", type: "select", list: "paymentModes", defaultValue: "Bank transfer" },
    { name: "reference", label: "Transaction / UTR no.", type: "text" },
    { name: "against", label: "Against", type: "text", computed: true },
    { name: "receiptNumber", label: "Receipt no.", type: "text", computed: true },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  // Stop typos like 75,000 for 7,500: a payment can't be more than what is still due.
  validate: async (v, record) => {
    const received = v.direction !== "paid";
    const target = received ? "invoices" : "purchases";
    const id = (received ? v.invoiceId : v.billId) as string | undefined;
    const amount = Number(v.amount) || 0;
    if (!id || amount <= 0) return amount < 0 ? "The amount can't be negative." : null;
    const snap = await getDoc(doc(db(), target, id));
    if (!snap.exists()) return null;
    const d = snap.data();
    // When editing, this payment is already counted in the balance.
    const already = record && (received ? record.invoiceId : record.billId) === id ? Number(record.amount) || 0 : 0;
    const due = Math.round(((Number(d.balance ?? d.total) || 0) + already) * 100) / 100;
    if (amount > due + 0.009)
      return due > 0
        ? `That's more than the balance due of ${formatCurrency(due)} on this ${received ? "invoice" : "bill"}. Check the amount.`
        : `This ${received ? "invoice" : "bill"} is already fully paid.`;
    return null;
  },
  beforeSave: (data) => {
    const received = data.direction !== "paid";
    return {
      ...data,
      receiptNumber: (data.receiptNumber as string) || docNumber(received ? "RCT" : "PAY"),
      invoiceId: received ? data.invoiceId : null,
      invoiceIdLabel: received ? data.invoiceIdLabel : null,
      billId: received ? null : data.billId,
      billIdLabel: received ? null : data.billIdLabel,
      against: received ? `Invoice ${data.invoiceIdLabel ?? ""}` : `Bill ${data.billIdLabel ?? ""}`,
    };
  },
  afterChange: async (data) => {
    if (data.invoiceId) await recalcPaid("invoices", String(data.invoiceId));
    if (data.billId) await recalcPaid("purchases", String(data.billId));
  },
};
