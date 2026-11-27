"use client";

import { ArrowDown, ArrowUp, CheckCircle2, CopyPlus, ImagePlus, Pencil, Plus, Printer, Share2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound, WithRecordId } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { friendlyError } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import type { LineItem } from "@/config/modules/types";
import { canRead } from "@/config/roles";
import { useRecord, useRecordsWhere } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { cn } from "@/lib/cn";
import { formatDate, todayISO } from "@/lib/format";
import { discountsOf, groupedTotals } from "@/lib/lineItems";
import { deleteDocument, highlightsFrom, KINDS, PROFILE_ID, reviseProposal, saveDoc, statusLabel, statusTone, uploadImage, type DocImage, type Fact, type Milestone, type SalesDoc, type Section } from "@/lib/salesDocs";
import { DocumentSheet } from "./DocumentSheet";
import { ShareDialog, useCaseStudies } from "./ShareDialog";

export function DocumentViewPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "documents")) return <NoAccess />;
  return <WithRecordId>{(id) => <DocumentView id={id} />}</WithRecordId>;
}

function DocumentView({ id }: { id: string }) {
  const profile = useProfile();
  const settings = useSettings();
  const router = useRouter();
  const { data, loading } = useRecord("documents", id);
  const d = data as SalesDoc | null;
  const cases = useCaseStudies();
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!d) return <NotFound what="document" />;

  const canEdit = moduleAccess("documents", profile).isManager;
  const isTemplate = Boolean(d.template) && d.id !== PROFILE_ID;
  const deal = !d.template && d.kind !== "case_study";
  const back = d.leadId ? { href: `/crm/leads/view?id=${d.leadId}`, label: String(d.leadIdLabel ?? "Lead") } : d.projectId ? { href: `/projects/view?id=${d.projectId}`, label: String(d.projectIdLabel ?? "Project") } : { href: "/crm/documents", label: "Documents" };
  const to = { name: d.party?.contact || d.party?.name, phone: d.party?.phone, email: d.party?.email };

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="print:hidden">
        <BackLink href={back.href} label={back.label} />
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{d.title}</h1>
              {deal && <Badge tone={statusTone(d.status)}>{statusLabel(d)}</Badge>}
              {d.shareToken && <Badge tone="violet">Shared</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              {isTemplate ? "Template: new documents start with this wording. {client}, {project}, {date} and the like are filled in." : [KINDS[d.kind].label, d.number, d.version && d.version > 1 ? `Revision ${d.version}` : null, d.party?.name].filter(Boolean).join(" · ")}
              {d.signedOn ? ` · ${statusLabel(d)} by ${d.signedBy ?? ""} on ${formatDate(d.signedOn)}` : ""}
            </p>
          </div>
          {!editing && (
            <div className="flex flex-wrap items-center gap-2">
              {!isTemplate && (
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer className="size-4" /> Print / PDF
                </Button>
              )}
              {!isTemplate && canEdit && (
                <Button variant="secondary" onClick={() => setSharing(true)}>
                  <Share2 className="size-4" /> Share
                </Button>
              )}
              {canEdit && d.kind === "proposal" && deal && d.status !== "superseded" && d.status !== "signed" && (
                <Button variant="secondary" onClick={() => void run(async () => router.push(`/crm/documents/view?id=${await reviseProposal(d, profile)}`))}>
                  <CopyPlus className="size-4" /> New revision
                </Button>
              )}
              {canEdit && deal && d.status !== "signed" && d.status !== "superseded" && (
                <Button variant="secondary" onClick={() => setSigning(true)}>
                  <CheckCircle2 className="size-4" /> Mark {KINDS[d.kind].signed.toLowerCase()}
                </Button>
              )}
              {canEdit && (
                <Button onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit
                </Button>
              )}
            </div>
          )}
        </div>
        {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
        {d.status === "superseded" && <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">A newer revision of this proposal replaces this one.</p>}
      </div>

      {editing ? (
        <DocEditor
          d={d}
          onDone={() => setEditing(false)}
          onDelete={
            d.template
              ? undefined
              : () =>
                  void run(async () => {
                    if (!window.confirm(`Delete ${d.title}? Its shared link stops working too.`)) return;
                    await deleteDocument(d);
                    router.push(back.href);
                  })
          }
        />
      ) : (
        <DocumentSheet doc={d} business={settings.business} highlights={d.id === PROFILE_ID ? highlightsFrom(cases.data) : undefined} />
      )}

      {sharing && <ShareDialog doc={d} to={to} onClose={() => setSharing(false)} />}
      {signing && <SignDialog d={d} onClose={() => setSigning(false)} />}
    </div>
  );
}

function SignDialog({ d, onClose }: { d: SalesDoc; onClose: () => void }) {
  const [name, setName] = useState(d.party?.contact ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const word = KINDS[d.kind].signed.toLowerCase();
  const save = async () => {
    try {
      await saveDoc(d.id, { status: "signed", signedBy: name.trim(), signedTitle: title.trim() || null, signedOn: date });
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Mark ${word}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="sign-form">Save</Button>
        </>
      }
    >
      <form id="sign-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), void save())}>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
        <p className="text-sm text-muted sm:col-span-2">
          {d.kind === "questionnaire" ? "Who answered it, and when." : `Record who ${word} it for ${d.party?.name || "the client"}. Keep the signed copy in the project's Assets.`}
        </p>
        <div>
          <label htmlFor="sg-name" className={labelClasses}>Name</label>
          <input id="sg-name" required className={inputClasses} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sg-title" className={labelClasses}>Designation</label>
          <input id="sg-title" className={inputClasses} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sg-date" className={labelClasses}>Date</label>
          <input id="sg-date" type="date" required className={inputClasses} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

/** Edits the title, the other party, the sections and (by kind) the price, summary or screenshots. */
function DocEditor({ d, onDone, onDelete }: { d: SalesDoc; onDone: () => void; onDelete?: () => void }) {
  const settings = useSettings();
  const [title, setTitle] = useState(d.title);
  const [date, setDate] = useState(d.date ?? "");
  const [party, setParty] = useState(d.party ?? { name: "" });
  const [sections, setSections] = useState<Section[]>(d.sections ?? []);
  const [summary, setSummary] = useState(d.summary ?? "");
  const [services, setServices] = useState<string[]>(d.services ?? []);
  const [images, setImages] = useState(d.images ?? []);
  const [validUntil, setValidUntil] = useState(d.validUntil ?? "");
  const [estimateId, setEstimateId] = useState(d.estimateId ?? "");
  const [subtitle, setSubtitle] = useState(d.subtitle ?? "");
  const [revisionNote, setRevisionNote] = useState(d.revisionNote ?? "");
  const [facts, setFacts] = useState<Fact[]>(d.facts ?? []);
  const [milestones, setMilestones] = useState<Milestone[]>(d.milestones ?? []);
  const [amcPercent, setAmcPercent] = useState(d.amcPercent === undefined || d.amcPercent === null ? "" : String(d.amcPercent));
  const [totalPrice, setTotalPrice] = useState(d.totalPrice === undefined || d.totalPrice === null ? "" : String(d.totalPrice));
  const [showItems, setShowItems] = useState(d.showItems !== false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const estimates = useRecordsWhere("estimates", "leadId", d.kind === "proposal" ? (d.leadId ?? null) : null);
  const deal = !d.template && d.kind !== "case_study";
  const questions = d.kind === "questionnaire";

  const setSection = (i: number, patch: Partial<Section>) => setSections((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: number) =>
    setSections((all) => {
      const next = [...all];
      const [s] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + by)), 0, s);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<SalesDoc> = { title: title.trim() || d.title, sections: sections.filter((s) => s.heading.trim() || s.body.trim()) };
      if (deal) Object.assign(patch, { date: date || null, party });
      if (d.kind === "case_study") Object.assign(patch, { summary: summary.trim(), services, images });
      if (d.kind === "proposal") {
        Object.assign(patch, {
          subtitle: subtitle.trim(),
          facts: facts.filter((f) => f.label.trim()),
          milestones: milestones.filter((m) => m.label.trim() || Number(m.percent)).map((m) => ({ label: m.label.trim(), percent: Number(m.percent) || 0 })),
          amcPercent: amcPercent === "" ? null : Number(amcPercent),
        });
      }
      if (d.kind === "proposal" && deal) {
        Object.assign(patch, { validUntil: validUntil || null, revisionNote: revisionNote.trim(), totalPrice: totalPrice === "" ? null : Number(totalPrice), showItems });
        const est = estimates.data.find((e) => e.id === estimateId);
        if (est && estimateId !== d.estimateId) {
          Object.assign(patch, {
            estimateId,
            estimateNumber: est.estimateNumber ?? null,
            items: (est.items as LineItem[] | undefined) ?? [],
            discountOnce: est.discountOnce ?? (est.discount as number | undefined) ?? null,
            discountAnnually: est.discountAnnually ?? null,
            discountMonthly: est.discountMonthly ?? null,
          });
        } else if (!estimateId && d.estimateId) {
          Object.assign(patch, { estimateId: null, estimateNumber: null, items: [] });
        }
      }
      await saveDoc(d.id, patch);
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const added: DocImage[] = [];
      for (const f of Array.from(files)) added.push(await uploadImage(d.id, f));
      setImages((all) => [...all, ...added]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <Card className="mx-auto max-w-3xl space-y-5 p-5 sm:p-6">
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="dc-title" className={labelClasses}>Title</label>
          <input id="dc-title" className={inputClasses} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {d.kind === "case_study" && (
          <>
            <div className="sm:col-span-2">
              <label htmlFor="dc-summary" className={labelClasses}>One-line summary</label>
              <input id="dc-summary" className={inputClasses} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. CRM that cut order processing time by 60% for a distributor" />
            </div>
            <div className="sm:col-span-2">
              <p className={labelClasses}>Services (to suggest it for leads interested in them)</p>
              <div className="flex flex-wrap gap-2">
                {settings.lists.services.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setServices((all) => (all.includes(s) ? all.filter((x) => x !== s) : [...all, s]))}
                    className={cn("rounded-full border px-3 py-1 text-sm", services.includes(s) ? "border-brand-500 bg-accent-soft font-medium text-accent" : "border-line text-body")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {deal && (
          <>
            <div>
              <label htmlFor="dc-party" className={labelClasses}>Client / company</label>
              <input id="dc-party" className={inputClasses} value={party.name} onChange={(e) => setParty({ ...party, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="dc-contact" className={labelClasses}>Contact person</label>
              <input id="dc-contact" className={inputClasses} value={party.contact ?? ""} onChange={(e) => setParty({ ...party, contact: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="dc-address" className={labelClasses}>Address</label>
              <input id="dc-address" className={inputClasses} value={party.address ?? ""} onChange={(e) => setParty({ ...party, address: e.target.value })} />
            </div>
            <div>
              <label htmlFor="dc-phone" className={labelClasses}>Phone / WhatsApp</label>
              <input id="dc-phone" className={inputClasses} value={party.phone ?? ""} onChange={(e) => setParty({ ...party, phone: e.target.value })} />
            </div>
            <div>
              <label htmlFor="dc-email" className={labelClasses}>Email</label>
              <input id="dc-email" type="email" className={inputClasses} value={party.email ?? ""} onChange={(e) => setParty({ ...party, email: e.target.value })} />
            </div>
            <div>
              <label htmlFor="dc-date" className={labelClasses}>Date</label>
              <input id="dc-date" type="date" className={inputClasses} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </>
        )}
        {d.kind === "proposal" && deal && (
          <>
            <div>
              <label htmlFor="dc-valid" className={labelClasses}>Valid until</label>
              <input id="dc-valid" type="date" className={inputClasses} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="dc-est" className={labelClasses}>Price from estimate</label>
              <select
                id="dc-est"
                className={inputClasses}
                value={estimateId}
                onChange={(e) => {
                  setEstimateId(e.target.value);
                  const est = estimates.data.find((x) => x.id === e.target.value);
                  if (est) {
                    const once = groupedTotals(est.items as LineItem[] | undefined, discountsOf(est)).find((g) => g.key === "once");
                    if (once) setTotalPrice(String(once.total));
                  }
                }}
              >
                <option value="">None</option>
                {d.estimateId && !estimates.data.some((e) => e.id === d.estimateId) && <option value={d.estimateId}>{d.estimateNumber ?? "Saved estimate"}</option>}
                {estimates.data.map((e) => (
                  <option key={e.id} value={e.id}>
                    {[e.estimateNumber, e.title].filter(Boolean).map(String).join(" · ")}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-subtle">Copies the estimate&apos;s lines and fills the total from its one-time charges. Pick it again after changing the estimate to refresh them.</p>
            </div>
            <div>
              <label htmlFor="dc-total" className={labelClasses}>Total project cost (₹)</label>
              <input id="dc-total" type="number" min={0} className={inputClasses} value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} placeholder="From the estimate" />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-body">
              <input type="checkbox" className="size-4 accent-brand-600" checked={showItems} onChange={(e) => setShowItems(e.target.checked)} />
              Show the estimate&apos;s line items too
            </label>
            <div className="sm:col-span-2">
              <label htmlFor="dc-revnote" className={labelClasses}>Revision note</label>
              <input id="dc-revnote" className={inputClasses} value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)} placeholder="e.g. replaces initial estimate" />
            </div>
          </>
        )}
        {d.kind === "proposal" && (
          <>
            <div className="sm:col-span-2">
              <label htmlFor="dc-sub" className={labelClasses}>Line under the title</label>
              <input id="dc-sub" className={inputClasses} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Scope of Work & Commercial Quotation · Android & iOS" />
            </div>
            <div className="sm:col-span-2">
              <p className={labelClasses}>Key details (box under the title)</p>
              <div className="space-y-2">
                {facts.map((f, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={cn(inputClasses, "w-2/5")} value={f.label} onChange={(e) => setFacts((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" aria-label={`Detail ${i + 1} label`} />
                    <input className={inputClasses} value={f.value} onChange={(e) => setFacts((all) => all.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Value" aria-label={`Detail ${i + 1} value`} />
                    <button type="button" onClick={() => setFacts((all) => all.filter((_, j) => j !== i))} className="rounded p-1 text-subtle hover:text-red-600" aria-label="Remove detail"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => setFacts((all) => [...all, { label: "", value: "" }])}><Plus className="size-4" /> Add detail</Button>
            </div>
            <div className="sm:col-span-2">
              <p className={labelClasses}>Payment milestones</p>
              <div className="space-y-2">
                {milestones.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={inputClasses} value={m.label} onChange={(e) => setMilestones((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Milestone" aria-label={`Milestone ${i + 1}`} />
                    <div className="relative w-24 shrink-0">
                      <input type="number" min={0} max={100} className={cn(inputClasses, "pr-6")} value={m.percent} onChange={(e) => setMilestones((all) => all.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))} aria-label={`Milestone ${i + 1} percent`} />
                      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-sm text-subtle">%</span>
                    </div>
                    <button type="button" onClick={() => setMilestones((all) => all.filter((_, j) => j !== i))} className="rounded p-1 text-subtle hover:text-red-600" aria-label="Remove milestone"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Button variant="secondary" size="sm" onClick={() => setMilestones((all) => [...all, { label: "", percent: 0 }])}><Plus className="size-4" /> Add milestone</Button>
                {(() => {
                  const sum = milestones.reduce((t, m) => t + (Number(m.percent) || 0), 0);
                  return <span className={cn("text-xs", sum === 100 ? "text-subtle" : "text-amber-600")}>Total {sum}%{sum === 100 ? "" : " (should be 100%)"}</span>;
                })()}
              </div>
              <p className="mt-1 text-xs text-subtle">The table with each amount appears under the Payment terms section; the total box under Project investment.</p>
            </div>
            <div>
              <label htmlFor="dc-amc" className={labelClasses}>AMC from the second year (% of total)</label>
              <input id="dc-amc" type="number" min={0} max={100} className={inputClasses} value={amcPercent} onChange={(e) => setAmcPercent(e.target.value)} />
            </div>
          </>
        )}
      </div>

      {d.kind === "case_study" && (
        <div>
          <p className={labelClasses}>Screenshots</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img, i) => (
              <div key={img.path} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- stored screenshots */}
                <img src={img.url} alt="" className="h-28 w-full rounded-lg border border-line object-cover" />
                <button type="button" onClick={() => setImages((all) => all.filter((_, j) => j !== i))} className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white" aria-label="Remove screenshot">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="grid h-28 place-items-center rounded-lg border border-dashed border-line text-sm text-muted hover:border-line-strong">
              <span className="flex items-center gap-1.5"><ImagePlus className="size-4" /> {uploading ? "Uploading…" : "Add"}</span>
            </button>
          </div>
          <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addImages(e.target.files)} />
        </div>
      )}

      <div>
        <p className={labelClasses}>{questions ? "Questions and answers" : "Sections"}</p>
        <p className="mb-3 text-xs text-subtle">
          Start a line with &quot;- &quot; for a bullet or &quot;1. &quot; for a numbered step; leave a blank line between paragraphs.
          {d.kind === "proposal" ? " \"## \" starts a sub-heading (3.1, 3.2…), \"| a | b |\" lines make a table, \"> \" makes a note, **text** is bold. {total}, {amcAmount}, {amcPercent} and {validDays} are worked out for you." : ""}
          {d.template ? " Placeholders like {client}, {project}, {date}, {company} and {companyAddress} are filled in for each new document." : ""}
        </p>
        <ol className="space-y-3">
          {sections.map((s, i) => (
            <li key={i} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-subtle tabular-nums">{i + 1}</span>
                <input className={cn(inputClasses, "font-medium")} value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })} placeholder={questions ? "Question" : "Heading"} aria-label={questions ? `Question ${i + 1}` : `Heading ${i + 1}`} />
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-subtle hover:text-foreground disabled:opacity-30" aria-label="Move up"><ArrowUp className="size-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="rounded p-1 text-subtle hover:text-foreground disabled:opacity-30" aria-label="Move down"><ArrowDown className="size-4" /></button>
                <button type="button" onClick={() => setSections((all) => all.filter((_, j) => j !== i))} className="rounded p-1 text-subtle hover:text-red-600" aria-label="Remove"><Trash2 className="size-4" /></button>
              </div>
              <textarea
                className={cn(inputClasses, "mt-2")}
                rows={questions ? 2 : Math.min(12, Math.max(3, s.body.split("\n").length + 1))}
                value={s.body}
                onChange={(e) => setSection(i, { body: e.target.value })}
                placeholder={questions ? "Answer (from the client or your call notes)" : "Text"}
                aria-label={questions ? `Answer ${i + 1}` : `Text ${i + 1}`}
              />
            </li>
          ))}
        </ol>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setSections((all) => [...all, { heading: "", body: "" }])}>
          <Plus className="size-4" /> {questions ? "Add question" : "Add section"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {onDelete && (
          <Button variant="ghost" className="mr-auto text-red-600" onClick={onDelete}>
            <Trash2 className="size-4" /> Delete
          </Button>
        )}
        <Button variant="secondary" className={onDelete ? "" : "ml-auto"} onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </Card>
  );
}
