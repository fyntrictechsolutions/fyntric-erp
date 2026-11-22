import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import type { Settings } from "@/components/settings/SettingsProvider";
import type { CommissionSlab } from "@/config/settingsDefaults";
import { loggedDelete, loggedSet } from "@/lib/audit";
import { db } from "@/lib/firebase";
import type { BaseRecord, UserProfile } from "@/types";

/**
 * Payroll: one payslip per employee per month, stored at payroll/{employeeId}_{YYYY-MM}.
 * Earnings start from the employee's current salary structure (cut for unpaid days), sales staff
 * add commission on the invoices they raised that month, and deductions (PF, ESI, professional tax)
 * are suggested from Settings → Defaults. Paid payslips add up into one "Salaries" expense per month,
 * so reports and the dashboard count them.
 */

export interface PayLine {
  name: string;
  amount: number;
}

export interface Commission {
  /** Invoiced value before GST, not drafts or cancelled. */
  sales: number;
  invoices: number;
  amount: number;
  mode: "tiered" | "flat";
}

export interface PayslipData {
  employeeId: string;
  employeeName: string;
  employeeCode?: string | null;
  designation?: string | null;
  department?: string | null;
  email?: string | null;
  /** The employee's user account, so they can see their own paid payslips. */
  accountId?: string | null;
  month: string;
  daysInMonth: number;
  lopDays: number;
  paidDays: number;
  /** Monthly salary in the structure, before unpaid days. */
  structureTotal: number;
  /** The structure's components for a full month, so unpaid days can be applied again when edited. */
  structure?: PayLine[];
  earnings: PayLine[];
  commission?: Commission | null;
  deductions: PayLine[];
  gross: number;
  totalDeductions: number;
  net: number;
  status: "draft" | "paid";
  paidOn?: string | null;
  paymentMode?: string | null;
  reference?: string | null;
  notes?: string | null;
  emailedAt?: number | null;
  emailedTo?: string | null;
}

export type Payslip = PayslipData & BaseRecord;

/** The stamp fields a saved payslip already has (kept when it's saved again). */
export interface SavedStamp {
  id?: string;
  userId?: string;
  userName?: string;
  createdBy?: string;
  createdAt?: number;
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (lines: PayLine[]) => round2(lines.reduce((t, l) => t + (Number(l.amount) || 0), 0));

export const payslipId = (employeeId: string, month: string) => `${employeeId}_${month}`;

export function daysIn(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Commission on a month's sales from the slabs in Settings → Defaults. */
export function commissionFor(sales: number, slabs: CommissionSlab[], mode: "tiered" | "flat"): number {
  if (sales <= 0 || !slabs.length) return 0;
  if (mode === "flat") {
    const slab = slabs.find((s) => s.upTo === null || sales <= s.upTo) ?? slabs[slabs.length - 1];
    return round2((sales * slab.rate) / 100);
  }
  let total = 0;
  let from = 0;
  for (const s of slabs) {
    const top = s.upTo === null ? Infinity : s.upTo;
    if (sales > from) total += ((Math.min(sales, top) - from) * s.rate) / 100;
    if (sales <= top) break;
    from = top;
  }
  return round2(total);
}

/** PF on Basic (up to the wage ceiling), ESI for lower salaries, and professional tax, from Settings → Defaults. */
export function suggestDeductions(earnings: PayLine[], gross: number, app: Settings["app"]): PayLine[] {
  const out: PayLine[] = [];
  const basic = earnings.find((e) => /^basic/i.test(e.name.trim()))?.amount ?? 0;
  if (app.pfRate > 0 && basic > 0) {
    const wage = app.pfWageCap > 0 ? Math.min(basic, app.pfWageCap) : basic;
    out.push({ name: "Provident fund (PF)", amount: Math.round((wage * app.pfRate) / 100) });
  }
  if (app.esiRate > 0 && gross > 0 && gross <= app.esiGrossLimit) out.push({ name: "ESI", amount: Math.ceil((gross * app.esiRate) / 100) });
  if (app.professionalTax > 0) out.push({ name: "Professional tax", amount: app.professionalTax });
  return out;
}

/** Gross, deductions and net pay of a payslip. Commission counts as an earning. */
export function totalsOf(earnings: PayLine[], deductions: PayLine[], commission?: Commission | null) {
  const gross = round2(sum(earnings) + (Number(commission?.amount) || 0));
  const totalDeductions = sum(deductions);
  return { gross, totalDeductions, net: round2(gross - totalDeductions) };
}

/** Invoices a salesperson raised in a month (by the invoice's issue date), value before GST. */
export async function salesFor(accountId: string, month: string) {
  const snap = await getDocs(query(collection(db(), "invoices"), where("userId", "==", accountId)));
  const counted = snap.docs.map((d) => d.data()).filter((i) => String(i.issueDate ?? "").startsWith(month) && i.status !== "draft" && i.status !== "cancelled");
  return { sales: round2(counted.reduce((t, i) => t + (Number(i.amount) || 0), 0)), invoices: counted.length };
}

/** A new draft payslip from the employee's salary structure, or a message saying why it can't be made. */
export async function draftPayslip(employee: BaseRecord, month: string, settings: Settings): Promise<PayslipData | string> {
  const salary = await getDoc(doc(db(), "salaries", employee.id));
  const current = salary.exists() ? (salary.data().current as { components?: PayLine[]; total?: number } | undefined) : undefined;
  if (!current?.components?.length) return `${String(employee.fullName ?? "This employee")} has no salary structure yet. Add one on their employee page first.`;
  const days = daysIn(month);
  const earnings = current.components.map((c) => ({ name: c.name, amount: Math.round(Number(c.amount) || 0) }));
  const accountId = (employee.accountId as string | undefined) ?? null;
  let commission: Commission | null = null;
  if (accountId) {
    const { sales, invoices } = await salesFor(accountId, month).catch(() => ({ sales: 0, invoices: 0 }));
    if (sales > 0) commission = { sales, invoices, amount: commissionFor(sales, settings.app.commissionSlabs, settings.app.commissionMode), mode: settings.app.commissionMode };
  }
  const gross = totalsOf(earnings, [], commission).gross;
  const deductions = suggestDeductions(earnings, gross, settings.app);
  return {
    employeeId: employee.id,
    employeeName: String(employee.fullName ?? ""),
    employeeCode: (employee.employeeCode as string) ?? null,
    designation: (employee.designation as string) ?? null,
    department: (employee.department as string) ?? null,
    email: ((employee.email || employee.accountEmail) as string) ?? null,
    accountId,
    month,
    daysInMonth: days,
    lopDays: 0,
    paidDays: days,
    structureTotal: round2(Number(current.total) || sum(earnings)),
    structure: earnings,
    earnings,
    commission,
    deductions,
    ...totalsOf(earnings, deductions, commission),
    status: "draft",
  };
}

/** Earnings cut for unpaid days: each structure amount × paid days ÷ days in the month. */
export function prorate(lines: PayLine[], paidDays: number, days: number): PayLine[] {
  const f = days ? Math.max(0, Math.min(paidDays, days)) / days : 1;
  return lines.map((l) => ({ ...l, amount: Math.round(l.amount * f) }));
}

export async function savePayslip(slip: PayslipData & SavedStamp, profile: UserProfile) {
  const id = slip.id ?? payslipId(slip.employeeId, slip.month);
  const { id: _drop, ...data } = slip as unknown as Record<string, unknown>;
  void _drop;
  const now = Date.now();
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  await loggedSet(
    doc(db(), "payroll", id),
    {
      ...clean,
      userId: (data.userId as string) ?? profile.id,
      userName: (data.userName as string) ?? profile.displayName,
      createdBy: (data.createdBy as string) ?? profile.id,
      createdAt: data.createdAt ?? now,
      updatedAt: now,
    },
  );
  return id;
}

export async function deletePayslip(slip: Payslip, profile: UserProfile) {
  await loggedDelete(doc(db(), "payroll", slip.id));
  if (slip.status === "paid") await syncPayrollExpense(slip.month, profile);
}

/**
 * Keeps one "Salaries" expense per month equal to the gross pay of that month's paid payslips,
 * so reports, profit and the dashboard include salaries without anyone entering them twice.
 */
export async function syncPayrollExpense(month: string, profile: UserProfile) {
  const snap = await getDocs(query(collection(db(), "payroll"), where("month", "==", month)));
  const paid = snap.docs.map((d) => d.data() as Payslip).filter((p) => p.status === "paid");
  const ref = doc(db(), "expenses", `payroll-${month}`);
  if (!paid.length) {
    await deleteDoc(ref).catch(() => undefined);
    return;
  }
  const gross = round2(paid.reduce((t, p) => t + (Number(p.gross) || 0), 0));
  const net = round2(paid.reduce((t, p) => t + (Number(p.net) || 0), 0));
  const lastPaid = paid.map((p) => p.paidOn ?? "").sort().pop() || `${month}-${String(daysIn(month)).padStart(2, "0")}`;
  const now = Date.now();
  // Keep who first created it: the rules don't let the owner fields change.
  const existing = await getDoc(ref).catch(() => null);
  const owner = existing?.exists() ? existing.data() : null;
  await setDoc(ref, {
    source: "payroll",
    month,
    date: lastPaid,
    category: "Salaries",
    amount: gross,
    description: `Salaries for ${monthLabel(month)}: ${paid.length} payslip${paid.length === 1 ? "" : "s"}, ₹${net.toLocaleString("en-IN")} net paid (from Payroll).`,
    paymentMode: "Bank transfer",
    status: "reimbursed",
    userId: owner?.userId ?? profile.id,
    userName: owner?.userName ?? profile.displayName,
    employeeId: null,
    createdBy: owner?.createdBy ?? profile.id,
    createdAt: owner?.createdAt ?? now,
    updatedAt: now,
  });
}

// ---------- Amount in words (Indian numbering) ----------

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`;
  return [h ? `${ONES[h]} Hundred` : "", rest].filter(Boolean).join(" ");
}

/** 125000 → "One Lakh Twenty Five Thousand Rupees Only". */
export function rupeesInWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (!n) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return `${parts.join(" ")} Rupees Only`;
}
