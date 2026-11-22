"use client";

import { collection, getDocs } from "firebase/firestore";
import { Check, Download, Loader2, MailPlus, Plus, Upload, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { Tabs } from "@/components/common/DetailShell";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NoAccess } from "@/components/resource/ModulePage";
import { friendlyError } from "@/components/resource/RecordEditor";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { canRead, ROLE_LABELS, ROLES, type ModuleKey } from "@/config/roles";
import { LIST_META, OFFER_PLACEHOLDERS, type BusinessSettings, type Holiday, type ListKey } from "@/config/settingsDefaults";
import { useLiveQuery } from "@/hooks/useCollection";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase";
import { formatDate, todayISO } from "@/lib/format";
import type { BaseRecord, UserProfile } from "@/types";
import { saveSettings, useSettings, type Settings, type SettingsSection } from "./SettingsProvider";

type Tab = "business" | "team" | "lists" | "defaults" | "offer" | "data" | "app";
type SaveState = "idle" | "saving" | "saved" | "error";

export function SettingsPage() {
  const profile = useProfile();
  const [tab, setTab] = useState<Tab>("business");
  const [state, setState] = useState<SaveState>("idle");
  if (!canRead(profile.role, "settings")) return <NoAccess />;

  return (
    <div className="animate-fade-up">
      <PageHeader title="Settings" description="Company details, dropdown lists and app preferences. Changes save automatically." actions={<SavePill state={state} />} />
      <Tabs<Tab>
        tabs={[
          { value: "business", label: "Business" },
          { value: "team", label: "Team" },
          { value: "lists", label: "Lists" },
          { value: "defaults", label: "Defaults" },
          { value: "offer", label: "Offer letter" },
          { value: "data", label: "Data" },
          { value: "app", label: "App" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "business" && <BusinessTab onState={setState} />}
      {tab === "team" && <TeamTab />}
      {tab === "lists" && <ListsTab onState={setState} />}
      {tab === "defaults" && <DefaultsTab onState={setState} />}
      {tab === "data" && <DataTab />}
      {tab === "offer" && <OfferTab onState={setState} />}
      {tab === "app" && <AppTab />}
    </div>
  );
}

function SavePill({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map = {
    saving: { tone: "neutral" as const, icon: <Loader2 className="size-3 animate-spin" />, text: "Saving…" },
    saved: { tone: "green" as const, icon: <Check className="size-3" />, text: "Saved" },
    error: { tone: "red" as const, icon: <X className="size-3" />, text: "Not saved" },
  }[state];
  return (
    <Badge tone={map.tone} className="gap-1">
      {map.icon} {map.text}
    </Badge>
  );
}

/** Edits to one settings section, saved shortly after the person stops typing. */
function useAutosave<S extends SettingsSection>(section: S, onState: (s: SaveState) => void) {
  const settings = useSettings();
  const [edits, setEdits] = useState<Partial<Settings[S]>>({});
  const pending = useRef<Partial<Settings[S]>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    onState("saving");
    try {
      await saveSettings(section, patch);
      onState("saved");
    } catch {
      onState("error");
    }
  }, [section, onState]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    void flush();
  }, [flush]);

  const set = <K extends keyof Settings[S]>(key: K, value: Settings[S][K], immediate = false) => {
    setEdits((e) => ({ ...e, [key]: value }));
    pending.current = { ...pending.current, [key]: value };
    if (timer.current) clearTimeout(timer.current);
    if (immediate) void flush();
    else timer.current = setTimeout(() => void flush(), 700);
  };

  const values = { ...settings[section], ...edits } as Settings[S];
  return { values, set };
}

const BUSINESS_FIELDS: { key: keyof BusinessSettings; label: string; placeholder?: string; wide?: boolean; help?: string }[] = [
  { key: "name", label: "Business name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "address", label: "Address", wide: true },
  { key: "gstin", label: "GSTIN", placeholder: "32ABCDE1234F1Z5" },
  { key: "pan", label: "PAN" },
  { key: "invoicePrefix", label: "Invoice number prefix", help: "e.g. INV gives numbers like INV-202611-4821" },
  { key: "estimatePrefix", label: "Estimate number prefix", help: "e.g. EST" },
  { key: "upiId", label: "UPI ID", placeholder: "fyntric@okicici" },
  { key: "bankName", label: "Bank name" },
  { key: "accountName", label: "Account name" },
  { key: "accountNumber", label: "Account number" },
  { key: "ifsc", label: "IFSC" },
  { key: "supportPhone", label: "Helpline number", help: "Shown on the Help & support page." },
  { key: "supportEmail", label: "Support email", help: "Shown on the Help & support page." },
];

function BusinessTab({ onState }: { onState: (s: SaveState) => void }) {
  const { values, set } = useAutosave("business", onState);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-base font-semibold text-foreground">Business details</h2>
      <p className="mb-5 text-sm text-muted">Shown on estimates, invoices, receipts, offer letters and payslips.</p>
      <LogoField value={values.logo} onChange={(v) => set("logo", v, true)} />
      <div className="grid gap-4 sm:grid-cols-2">
        {BUSINESS_FIELDS.map((f) => (
          <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
            <label htmlFor={`b-${f.key}`} className={labelClasses}>{f.label}</label>
            {f.wide ? (
              <textarea id={`b-${f.key}`} rows={2} className={inputClasses} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input id={`b-${f.key}`} className={inputClasses} value={values[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
            )}
            {f.help && <p className="mt-1 text-xs text-subtle">{f.help}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Shrinks a picture to fit 480×160 and returns it as a data URL (PNG keeps transparency; JPEG if that's much smaller). */
async function shrinkLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't a picture we can read. Try a PNG or JPEG."));
      i.src = url;
    });
    const scale = Math.min(1, 480 / img.naturalWidth, 160 / img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    if (png.length < 200_000) return png;
    const flat = document.createElement("canvas");
    flat.width = canvas.width;
    flat.height = canvas.height;
    const g = flat.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, flat.width, flat.height);
    g.drawImage(canvas, 0, 0);
    return flat.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function LogoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-line p-4">
      <div className="grid h-16 w-40 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-line">
        {value ? (
          // A small data URL, so next/image adds nothing.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Company logo" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-slate-400">No logo</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Company logo</p>
        <p className="text-xs text-muted">PNG or JPEG, ideally a wide logo on a transparent or white background. It&apos;s printed on every document the app makes.</p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>
            <Upload className="size-4" /> {value ? "Change logo" : "Upload logo"}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange("")}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError(null);
            try {
              onChange(await shrinkLogo(file));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      </div>
    </div>
  );
}

function TeamTab() {
  const { data, loading } = useLiveQuery<BaseRecord & UserProfile>(() => collection(db(), "users"), "users:settings");
  const pending = data.filter((u) => u.role === "pending").length;
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">Team</h2>
            <p className="text-sm text-muted">
              {loading ? "Loading…" : `${data.length} ${data.length === 1 ? "person has" : "people have"} access`}
              {pending ? `, ${pending} waiting for a role` : ""}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/users" className={buttonClasses("secondary")}>
              <Users className="size-4" /> Manage users & roles
            </Link>
            <Link href="/admin/users" className={buttonClasses("primary")}>
              <MailPlus className="size-4" /> Invite member
            </Link>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ROLES.map((r) => (
          <Card key={r} className="p-4">
            <p className="text-xs font-medium text-muted">{ROLE_LABELS[r]}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">{data.filter((u) => u.role === r).length}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

const LIST_KEYS = Object.keys(LIST_META).filter((k) => k !== "holidays") as ListKey[];

function ListsTab({ onState }: { onState: (s: SaveState) => void }) {
  const { values, set } = useAutosave("lists", onState);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        These are the dropdowns that can&apos;t be filled from another page. Clients, leads, products and suppliers are added on their own pages. Removing an option doesn&apos;t change records that already use it.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {LIST_KEYS.map((key) => (
          <ListEditor key={key} name={key} items={values[key]} onChange={(items) => set(key, items, true)} />
        ))}
      </div>
      <HolidayEditor items={values.holidays} onChange={(items) => set("holidays", items, true)} />
    </div>
  );
}

function ListEditor({ name, items, onChange }: { name: ListKey; items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const meta = LIST_META[name];
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v || items.some((i) => i.toLowerCase() === v.toLowerCase())) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="font-medium text-foreground">{meta.label}</h3>
      <p className="mb-3 text-xs text-muted">{meta.help}</p>
      <ul className="mb-3 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item} className="inline-flex items-center gap-1 rounded-full border border-line bg-tint py-0.5 pr-1 pl-3 text-sm text-body">
            {item}
            <button type="button" onClick={() => onChange(items.filter((i) => i !== item))} className="rounded-full p-0.5 text-subtle hover:bg-tint-strong hover:text-red-600" aria-label={`Remove ${item}`}>
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {!items.length && <li className="text-sm text-subtle">No options yet.</li>}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input className={inputClasses} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add an option" aria-label={`Add to ${meta.label}`} />
        <Button type="submit" variant="secondary" disabled={!draft.trim()}>
          <Plus className="size-4" /> Add
        </Button>
      </form>
    </Card>
  );
}

function HolidayEditor({ items, onChange }: { items: Holiday[]; onChange: (items: Holiday[]) => void }) {
  const [date, setDate] = useState(todayISO());
  const [name, setName] = useState("");
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim()) return;
    onChange([...items.filter((h) => h.date !== date), { date, name: name.trim() }]);
    setName("");
  };
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="font-medium text-foreground">{LIST_META.holidays.label}</h3>
      <p className="mb-3 text-xs text-muted">
        {LIST_META.holidays.help} Pre-filled with Kerala government holidays for 2026; dates that depend on the moon (Id, Bakrid, Muharram) can move, so check them.
      </p>
      <ul className="mb-3 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {sorted.map((h) => (
          <li key={h.date} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="w-28 shrink-0 tabular-nums text-muted">{formatDate(h.date)}</span>
            <span className="flex-1 text-body">{h.name}</span>
            <button type="button" onClick={() => onChange(items.filter((i) => i.date !== h.date))} className="rounded p-1 text-subtle hover:text-red-600" aria-label={`Remove ${h.name}`}>
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <input type="date" className={cn(inputClasses, "sm:w-44")} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Holiday date" />
        <input className={inputClasses} value={name} onChange={(e) => setName(e.target.value)} placeholder="Holiday name" aria-label="Holiday name" />
        <Button type="submit" variant="secondary" disabled={!name.trim()}>
          <Plus className="size-4" /> Add
        </Button>
      </form>
    </Card>
  );
}

const EXPORT_COLLECTIONS: (ModuleKey | "users")[] = [
  "employees", "attendance", "leave", "candidates", "salaries", "exits", "leads", "followups", "estimates", "clients", "products", "projects", "timesheets",
  "suppliers", "purchases", "invoices", "payments", "expenses", "users",
];

function toCsv(rows: Record<string, unknown>[]) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function readAll(name: string) {
  const snap = await getDocs(collection(db(), name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function DataTab() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };
  const backup = () =>
    run("all", async () => {
      const out: Record<string, unknown> = { exportedAt: new Date().toISOString() };
      for (const c of [...EXPORT_COLLECTIONS, "settings", "invites"]) out[c] = await readAll(c);
      download(`fyntric-erp-backup-${todayISO()}.json`, JSON.stringify(out, null, 2), "application/json");
    });

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">Full backup</h2>
            <p className="text-sm text-muted">Everything in one JSON file. Keep a copy somewhere safe every month.</p>
          </div>
          <Button onClick={backup} disabled={busy !== null}>
            {busy === "all" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download backup
          </Button>
        </div>
      </Card>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-semibold text-foreground">Export to Excel</h2>
          <p className="text-sm text-muted">One CSV file per list. Opens in Excel or Google Sheets.</p>
        </div>
        <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
          {EXPORT_COLLECTIONS.map((c) => (
            <li key={c} className="flex items-center justify-between gap-3 border-line px-5 py-3 sm:border-b">
              <span className="text-sm text-foreground capitalize">{c === "purchases" ? "Purchase bills" : c === "followups" ? "Lead follow-ups" : c}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => run(c, async () => download(`${c}-${todayISO()}.csv`, toCsv(await readAll(c)), "text/csv"))}
              >
                {busy === c ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} CSV
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function DefaultsTab({ onState }: { onState: (s: SaveState) => void }) {
  const { values, set } = useAutosave("app", onState);
  const num = (v: string) => (v === "" ? 0 : Number(v));
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <h2 className="mb-5 font-display text-base font-semibold text-foreground">Office and estimates</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="a-hours" className={labelClasses}>Working hours a day</label>
            <input id="a-hours" type="number" min={1} max={24} step={0.5} className={inputClasses} value={values.workHours} onChange={(e) => set("workHours", num(e.target.value))} />
            <p className="mt-1 text-xs text-subtle">A day with fewer hours shows red on the attendance calendar.</p>
          </div>
          <div>
            <label htmlFor="a-open" className={labelClasses}>Office opens at</label>
            <input id="a-open" type="time" className={inputClasses} value={values.officeOpenTime} onChange={(e) => set("officeOpenTime", e.target.value)} />
            <p className="mt-1 text-xs text-subtle">A check-in after this counts as late.</p>
          </div>
          <div>
            <label htmlFor="a-close" className={labelClasses}>Office closes at</label>
            <input id="a-close" type="time" className={inputClasses} value={values.officeCloseTime} onChange={(e) => set("officeCloseTime", e.target.value)} />
          </div>
          <div>
            <label htmlFor="a-tax" className={labelClasses}>Default GST (%)</label>
            <input id="a-tax" type="number" min={0} max={100} className={inputClasses} value={values.defaultTaxRate} onChange={(e) => set("defaultTaxRate", num(e.target.value))} />
          </div>
          <div>
            <label htmlFor="a-valid" className={labelClasses}>Estimate valid for (days)</label>
            <input id="a-valid" type="number" min={1} className={inputClasses} value={values.estimateValidityDays} onChange={(e) => set("estimateValidityDays", num(e.target.value))} />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="a-terms" className={labelClasses}>Default estimate terms</label>
            <textarea id="a-terms" rows={4} className={inputClasses} value={values.estimateTerms} onChange={(e) => set("estimateTerms", e.target.value)} />
          </div>
        </div>
      </Card>
      <CommissionCard values={values} set={set} />
      <PayrollDefaultsCard values={values} set={set} num={num} />
    </div>
  );
}

function AppTab() {
  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">Theme</h2>
          <p className="text-sm text-muted">Light or dark, remembered on this device.</p>
        </div>
        <ThemeToggle />
      </Card>
    </div>
  );
}

type AppValues = Settings["app"];
type SetApp = <K extends keyof AppValues>(key: K, value: AppValues[K], immediate?: boolean) => void;

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Commission slabs for sales staff: "up to ₹X earns Y%", lowest first; the last slab has no upper limit. */
function CommissionCard({ values, set }: { values: AppValues; set: SetApp }) {
  const slabs = values.commissionSlabs;
  const update = (i: number, patch: Partial<AppValues["commissionSlabs"][number]>) => set("commissionSlabs", slabs.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)));
  const add = () => {
    const last = slabs[slabs.length - 1];
    const prevTop = slabs.length > 1 ? slabs[slabs.length - 2].upTo ?? 0 : 0;
    // The open-ended slab stays last: the new one goes before it.
    const next = [...slabs.slice(0, -1), { upTo: (prevTop || 0) + 100000, rate: last?.rate ?? 1 }, last ?? { upTo: null, rate: 1 }];
    set("commissionSlabs", next, true);
  };
  const remove = (i: number) => set("commissionSlabs", slabs.filter((_, j) => j !== i), true);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-base font-semibold text-foreground">Sales commission</h2>
      <p className="mb-4 text-sm text-muted">
        Added to a salesperson&apos;s payroll from the invoices they raised that month (value before GST, not drafts or cancelled).
      </p>
      <div className="space-y-2">
        {slabs.map((sl, i) => {
          const from = i === 0 ? 0 : slabs[i - 1].upTo ?? 0;
          const open = i === slabs.length - 1;
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-28 text-muted">{i === 0 ? "Up to" : `${inr(from)} to`}</span>
              {open ? (
                <span className="w-36 text-muted">no limit</span>
              ) : (
                <input
                  aria-label={`Slab ${i + 1} up to`}
                  type="number"
                  min={from + 1}
                  className={cn(inputClasses, "!w-36")}
                  value={sl.upTo ?? ""}
                  onChange={(e) => update(i, { upTo: e.target.value === "" ? 0 : Number(e.target.value) })}
                />
              )}
              <span className="text-muted">earns</span>
              <input aria-label={`Slab ${i + 1} rate`} type="number" min={0} max={100} step={0.1} className={cn(inputClasses, "!w-24")} value={sl.rate} onChange={(e) => update(i, { rate: Number(e.target.value) || 0 })} />
              <span className="text-muted">%</span>
              {slabs.length > 1 && !open && (
                <button type="button" onClick={() => remove(i)} className="rounded-lg p-1.5 text-muted hover:bg-tint-strong hover:text-red-600" aria-label={`Remove slab ${i + 1}`}>
                  <X className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Button variant="secondary" size="sm" className="mt-3" onClick={add}>
        <Plus className="size-4" /> Add slab
      </Button>
      <fieldset className="mt-5">
        <legend className={labelClasses}>How the slabs apply</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["tiered", "Each part at its own rate", "e.g. ₹5 lakh sales: 1% on the first ₹1 lakh + 3% on the next ₹4 lakh = ₹13,000."],
              ["flat", "Whole amount at the slab reached", "e.g. ₹5 lakh sales: all of it at 3% = ₹15,000."],
            ] as const
          ).map(([v, title, hint]) => (
            <label key={v} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 text-sm", values.commissionMode === v ? "border-brand-500 bg-accent-soft" : "border-line")}>
              <input type="radio" name="commissionMode" className="mt-0.5 accent-brand-600" checked={values.commissionMode === v} onChange={() => set("commissionMode", v, true)} />
              <span>
                <span className="font-medium text-foreground">{title}</span>
                <span className="mt-0.5 block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </Card>
  );
}

function PayrollDefaultsCard({ values, set, num }: { values: AppValues; set: SetApp; num: (v: string) => number }) {
  const field = (key: "pfRate" | "pfWageCap" | "esiRate" | "esiGrossLimit" | "professionalTax", label: string, help: string, step = 1) => (
    <div>
      <label htmlFor={`p-${key}`} className={labelClasses}>{label}</label>
      <input id={`p-${key}`} type="number" min={0} step={step} className={inputClasses} value={values[key]} onChange={(e) => set(key, num(e.target.value))} />
      <p className="mt-1 text-xs text-subtle">{help}</p>
    </div>
  );
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-base font-semibold text-foreground">Payroll deductions</h2>
      <p className="mb-5 text-sm text-muted">Suggested on each new payslip; HR can change them on the payslip before saving.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {field("pfRate", "Employee PF (% of Basic)", "0 turns PF off.", 0.5)}
        {field("pfWageCap", "PF wage ceiling (₹)", "PF is worked out on Basic up to this. 0 = no ceiling.")}
        {field("professionalTax", "Professional tax a month (₹)", "0 = none.")}
        {field("esiRate", "Employee ESI (% of gross)", "0 turns ESI off.", 0.05)}
        {field("esiGrossLimit", "ESI applies up to gross (₹)", "People earning more a month don't pay ESI.")}
      </div>
    </Card>
  );
}

function OfferTab({ onState }: { onState: (s: SaveState) => void }) {
  const { values, set } = useAutosave("offer", onState);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-base font-semibold text-foreground">Offer letter format</h2>
      <p className="mb-2 text-sm text-muted">
        The common wording of every offer letter. When HR prepares an offer for a candidate, the blanks in curly braces are filled in and the finished letter is saved with the candidate.
      </p>
      <p className="mb-5 flex flex-wrap gap-1.5 text-xs">
        {OFFER_PLACEHOLDERS.map((p) => (
          <code key={p} className="rounded bg-tint-strong px-1.5 py-0.5 text-muted">{`{${p}}`}</code>
        ))}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="o-subject" className={labelClasses}>Subject</label>
          <input id="o-subject" className={inputClasses} value={values.subject} onChange={(e) => set("subject", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="o-body" className={labelClasses}>Letter</label>
          <textarea id="o-body" rows={12} className={inputClasses} value={values.body} onChange={(e) => set("body", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="o-terms" className={labelClasses}>Terms (one per line)</label>
          <textarea id="o-terms" rows={4} className={inputClasses} value={values.terms} onChange={(e) => set("terms", e.target.value)} />
        </div>
        <div>
          <label htmlFor="o-sname" className={labelClasses}>Signed by (name)</label>
          <input id="o-sname" className={inputClasses} value={values.signatoryName} onChange={(e) => set("signatoryName", e.target.value)} />
        </div>
        <div>
          <label htmlFor="o-stitle" className={labelClasses}>Signatory designation</label>
          <input id="o-stitle" className={inputClasses} value={values.signatoryTitle} onChange={(e) => set("signatoryTitle", e.target.value)} />
        </div>
        <div>
          <label htmlFor="o-prob" className={labelClasses}>Default probation (months)</label>
          <input id="o-prob" type="number" min={0} className={inputClasses} value={values.probationMonths} onChange={(e) => set("probationMonths", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label htmlFor="o-notice" className={labelClasses}>Default notice period (days)</label>
          <input id="o-notice" type="number" min={0} className={inputClasses} value={values.noticePeriodDays} onChange={(e) => set("noticePeriodDays", Number(e.target.value) || 0)} />
        </div>
      </div>
    </Card>
  );
}
