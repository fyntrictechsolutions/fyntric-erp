import { ShoppingCart, Truck } from "lucide-react";
import { addDays } from "./options";
import { todayISO } from "@/lib/format";
import { ACTIVE_STATUS, BILLING_CYCLES } from "./options";
import type { ModuleDefinition } from "./types";

export const suppliersModule: ModuleDefinition = {
  key: "suppliers",
  title: "Suppliers",
  singular: "Supplier",
  description: "Vendors you buy subscriptions, equipment, furniture and supplies from.",
  icon: Truck,
  href: "/purchases/suppliers",
  statusField: "status",
  searchFields: ["name", "contactPerson", "phone", "email", "category"],
  columns: ["name", "category", "contactPerson", "phone", "email", "status"],
  fields: [
    { name: "name", label: "Supplier name", type: "text", required: true },
    { name: "category", label: "Category", type: "select", list: "supplierCategories" },
    { name: "contactPerson", label: "Contact person", type: "text" },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "email", label: "Email", type: "email" },
    { name: "website", label: "Website", type: "text" },
    { name: "gstin", label: "GSTIN", type: "text" },
    { name: "status", label: "Status", type: "select", defaultValue: "active", options: ACTIVE_STATUS },
    { name: "address", label: "Address", type: "textarea", wide: true },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
};

export const purchasesModule: ModuleDefinition = {
  key: "purchases",
  title: "Purchase bills",
  singular: "Purchase bill",
  description: "Bills from suppliers. Record payments against them under Finance > Payments.",
  icon: ShoppingCart,
  href: "/purchases/bills",
  statusField: "status",
  searchFields: ["billNumber", "supplierIdLabel", "category", "description"],
  columns: ["billDate", "billNumber", "supplierId", "category", "total", "balance", "status"],
  fields: [
    { name: "supplierId", label: "Supplier", type: "reference", required: true, reference: { module: "suppliers", labelField: "name" } },
    { name: "billNumber", label: "Bill / invoice no.", type: "text", required: true },
    { name: "billDate", label: "Bill date", type: "date", required: true, defaultValue: () => todayISO() },
    { name: "dueDate", label: "Due date", type: "date", defaultValue: () => addDays(todayISO(), 15) },
    { name: "category", label: "Category", type: "select", required: true, list: "purchaseCategories" },
    { name: "amount", label: "Amount (before GST)", type: "currency", required: true, min: 0 },
    { name: "taxRate", label: "GST (%)", type: "percent", min: 0, max: 100, defaultValue: ({ settings }) => settings.app.defaultTaxRate },
    { name: "total", label: "Total", type: "currency", computed: true },
    { name: "amountPaid", label: "Paid", type: "currency", computed: true },
    { name: "balance", label: "Balance", type: "currency", computed: true },
    {
      name: "status",
      label: "Payment status",
      type: "select",
      computed: true,
      options: [
        { value: "unpaid", label: "Unpaid", tone: "red" },
        { value: "partial", label: "Part paid", tone: "amber" },
        { value: "paid", label: "Paid", tone: "green" },
      ],
    },
    { name: "isSubscription", label: "Recurring subscription", type: "checkbox" },
    { name: "billingCycle", label: "Renews", type: "select", options: BILLING_CYCLES, defaultValue: "monthly", showWhen: (v) => Boolean(v.isSubscription) },
    { name: "renewalDate", label: "Next renewal", type: "date", showWhen: (v) => Boolean(v.isSubscription) },
    { name: "description", label: "What was bought", type: "textarea", wide: true },
  ],
  beforeSave: (data) => {
    const amount = Number(data.amount) || 0;
    const tax = Number(data.taxRate) || 0;
    const total = Math.round(amount * (1 + tax / 100) * 100) / 100;
    const paid = Number(data.amountPaid) || 0;
    const balance = Math.round((total - paid) * 100) / 100;
    return {
      ...data,
      total,
      amountPaid: paid,
      balance,
      status: paid <= 0 ? "unpaid" : balance <= 0 ? "paid" : "partial",
      billingCycle: data.isSubscription ? data.billingCycle : null,
      renewalDate: data.isSubscription ? data.renewalDate : null,
    };
  },
};
