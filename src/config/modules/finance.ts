import { CheckCheck, Check, FileText, Receipt, Wallet, X } from "lucide-react";
import { todayISO } from "@/lib/format";
import type { ModuleDefinition } from "./types";

function invoiceNumber(): string {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `FT-${ym}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export const invoicesModule: ModuleDefinition = {
  key: "invoices",
  title: "Invoices",
  singular: "Invoice",
  description: "Bills raised to clients, with GST and payment status.",
  icon: FileText,
  href: "/finance/invoices",
  statusField: "status",
  searchFields: ["invoiceNumber", "clientIdLabel", "projectIdLabel"],
  columns: ["invoiceNumber", "clientId", "issueDate", "dueDate", "total", "status"],
  fields: [
    { name: "invoiceNumber", label: "Invoice number", type: "text", help: "Leave blank to generate one." },
    { name: "clientId", label: "Client", type: "reference", required: true, reference: { module: "clients", labelField: "name" } },
    { name: "projectId", label: "Project", type: "reference", reference: { module: "projects", labelField: "name" } },
    { name: "issueDate", label: "Issue date", type: "date", required: true, defaultValue: todayISO },
    { name: "dueDate", label: "Due date", type: "date" },
    { name: "amount", label: "Amount (before tax)", type: "currency", required: true, min: 0 },
    { name: "taxRate", label: "GST (%)", type: "percent", defaultValue: 18, min: 0, max: 100 },
    { name: "total", label: "Total", type: "currency", computed: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: "draft",
      options: [
        { value: "draft", label: "Draft", tone: "neutral" },
        { value: "sent", label: "Sent", tone: "blue" },
        { value: "paid", label: "Paid", tone: "green" },
        { value: "overdue", label: "Overdue", tone: "red" },
        { value: "cancelled", label: "Cancelled", tone: "neutral" },
      ],
    },
    { name: "paidDate", label: "Paid on", type: "date" },
    { name: "notes", label: "Line items / notes", type: "textarea", wide: true },
  ],
  beforeSave: (data) => {
    const amount = Number(data.amount) || 0;
    const tax = Number(data.taxRate) || 0;
    return {
      ...data,
      invoiceNumber: (data.invoiceNumber as string)?.trim() || invoiceNumber(),
      total: Math.round(amount * (1 + tax / 100) * 100) / 100,
    };
  },
  actions: [
    {
      label: "Mark paid",
      icon: CheckCheck,
      requires: "editor",
      when: (r) => r.status === "sent" || r.status === "overdue",
      patch: () => ({ status: "paid", paidDate: todayISO() }),
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
  searchFields: ["description", "category", "userName", "projectIdLabel"],
  columns: ["date", "category", "description", "amount", "status"],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, defaultValue: todayISO },
    {
      name: "category",
      label: "Category",
      type: "select",
      required: true,
      options: [
        "Travel",
        "Software & subscriptions",
        "Hardware",
        "Office & rent",
        "Utilities & internet",
        "Marketing",
        "Salaries",
        "Food & hospitality",
        "Other",
      ].map((c) => ({ value: c, label: c })),
    },
    { name: "amount", label: "Amount", type: "currency", required: true, min: 0 },
    {
      name: "paymentMode",
      label: "Paid by",
      type: "select",
      defaultValue: "upi",
      options: [
        { value: "upi", label: "UPI" },
        { value: "card", label: "Card" },
        { value: "bank", label: "Bank transfer" },
        { value: "cash", label: "Cash" },
      ],
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
