import { Check, FileText, HandCoins, Receipt, Wallet, X } from "lucide-react";
import { todayISO } from "@/lib/format";
import { recalcPaid } from "@/lib/payments";
import { docNumber } from "./options";
import type { ModuleDefinition, SelectOption } from "./types";

export const invoicesModule: ModuleDefinition = {
  key: "invoices",
  title: "Invoices",
  singular: "Invoice",
  description: "Bills raised to clients, with GST and payment status.",
  icon: FileText,
  href: "/finance/invoices",
  statusField: "status",
  searchFields: ["invoiceNumber", "clientIdLabel", "projectIdLabel"],
  columns: ["invoiceNumber", "clientId", "issueDate", "dueDate", "total", "balance", "status"],
  fields: [
    { name: "invoiceNumber", label: "Invoice number", type: "text", help: "Leave blank to generate one." },
    { name: "clientId", label: "Client", type: "reference", required: true, reference: { module: "clients", labelField: "name" } },
    { name: "projectId", label: "Project", type: "reference", reference: { module: "projects", labelField: "name" } },
    { name: "issueDate", label: "Issue date", type: "date", required: true, defaultValue: todayISO },
    { name: "dueDate", label: "Due date", type: "date" },
    { name: "amount", label: "Amount (before tax)", type: "currency", required: true, min: 0 },
    { name: "taxRate", label: "GST (%)", type: "percent", defaultValue: 18, min: 0, max: 100 },
    { name: "total", label: "Total", type: "currency", computed: true },
    { name: "amountPaid", label: "Paid", type: "currency", computed: true },
    { name: "balance", label: "Balance due", type: "currency", computed: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: "draft",
      options: [
        { value: "draft", label: "Draft", tone: "neutral" },
        { value: "sent", label: "Sent", tone: "blue" },
        { value: "partial", label: "Part paid", tone: "violet" },
        { value: "paid", label: "Paid", tone: "green" },
        { value: "overdue", label: "Overdue", tone: "red" },
        { value: "cancelled", label: "Cancelled", tone: "neutral" },
      ],
    },
    { name: "paidDate", label: "Paid on", type: "date" },
    { name: "notes", label: "Line items / notes", type: "textarea", wide: true },
  ],
  beforeSave: (data, { settings }) => {
    const amount = Number(data.amount) || 0;
    const tax = Number(data.taxRate) || 0;
    const total = Math.round(amount * (1 + tax / 100) * 100) / 100;
    const paid = Number(data.amountPaid) || 0;
    return {
      ...data,
      invoiceNumber: (data.invoiceNumber as string)?.trim() || docNumber(settings.business.invoicePrefix),
      total,
      amountPaid: paid,
      balance: Math.round((total - paid) * 100) / 100,
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
  ownerLabel: "Recorded by",
  statusField: "direction",
  searchFields: ["against", "reference", "mode", "notes"],
  columns: ["date", "direction", "against", "amount", "mode", "reference"],
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
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  beforeSave: (data) => {
    const received = data.direction !== "paid";
    return {
      ...data,
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
