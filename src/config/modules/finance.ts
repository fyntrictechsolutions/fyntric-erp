import { Check, FileText, HandCoins, Receipt, Wallet, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCurrency, todayISO } from "@/lib/format";
import { recalcPaid } from "@/lib/payments";
import { discountedTotals } from "@/lib/lineItems";
import { docNumber } from "./options";
import type { LineItem, ModuleDefinition, SelectOption } from "./types";

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
  searchFields: ["description", "category", "userName", "projectIdLabel"],
  columns: ["date", "category", "description", "amount", "status"],
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
      name: "paymentMode",
      label: "Paid by",
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
