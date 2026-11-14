"use client";

import { CalendarClock, CheckCircle2, FileSignature, Mail, MessageCircle, Pencil, Phone, Printer, Send, UserCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ShareInvite } from "@/components/admin/UsersAdmin";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, DetailGrid, Loading, NotFound, RecordFields, Tabs, WithRecordId } from "@/components/common/DetailShell";
import { FileList } from "@/components/common/FileList";
import { NoAccess } from "@/components/resource/ModulePage";
import { friendlyError, RecordEditor } from "@/components/resource/RecordEditor";
import { ReferenceSelect } from "@/components/resource/ReferenceSelect";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import type { FieldDefinition } from "@/config/modules";
import { CANDIDATE_STAGES, candidatesModule, INTERVIEW_PHASES, INTERVIEW_STATUS } from "@/config/modules/hiring";
import { canRead } from "@/config/roles";
import { useRecord } from "@/hooks/useCollection";
import { moduleAccess } from "@/lib/access";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import { buildOfferLetter, offerAsText, type OfferInput, type OfferLetter } from "@/lib/offerLetter";
import { updateRecord } from "@/lib/records";
import { createInvite, type Invite } from "@/lib/team";
import type { BaseRecord } from "@/types";

export function CandidateDetailPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "candidates")) return <NoAccess />;
  return <WithRecordId>{(id) => <CandidateDetail id={id} />}</WithRecordId>;
}

type Tab = "details" | "interviews";

export interface Interview {
  interviewerId?: string | null;
  interviewerIdLabel?: string | null;
  date?: string;
  time?: string;
  mode?: "online" | "in_person";
  meetingLink?: string;
  venue?: string;
  status?: "pending" | "passed" | "failed";
  feedback?: string;
  invitedAt?: number | null;
}

const INTERVIEWER: FieldDefinition = { name: "interviewerId", label: "Interviewer", type: "reference", reference: { module: "employees", labelField: "fullName" } };

function whatsapp(phone: unknown) {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d ? `https://wa.me/${d.length === 10 ? `91${d}` : d}` : null;
}

function CandidateDetail({ id }: { id: string }) {
  const profile = useProfile();
  const { data: c, loading } = useRecord("candidates", id);
  const [tab, setTab] = useState<Tab>("details");
  const [editing, setEditing] = useState(false);

  if (loading) return <Loading />;
  if (!c) return <NotFound what="candidate" />;

  const access = moduleAccess(candidatesModule, profile);
  const canEdit = access.canEdit(c);
  const stage = CANDIDATE_STAGES.find((o) => o.value === c.stage);
  const wa = whatsapp(c.phone);

  return (
    <div className="animate-fade-up">
      <BackLink href="/hr/hiring" label="All candidates" />
      <PageHeader
        title={String(c.fullName ?? "Candidate")}
        description={[c.designation, c.experienceYears != null && c.experienceYears !== "" ? `${c.experienceYears} yrs experience` : null].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            {stage && <Badge tone={stage.tone}>{stage.label}</Badge>}
            {typeof c.phone === "string" && c.phone && (
              <a href={`tel:${c.phone}`} className={buttonClasses("secondary")} aria-label="Call">
                <Phone className="size-4" />
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses("secondary")} aria-label="WhatsApp">
                <MessageCircle className="size-4" />
              </a>
            )}
            {typeof c.email === "string" && c.email && (
              <a href={`mailto:${c.email}`} className={buttonClasses("secondary")} aria-label="Email">
                <Mail className="size-4" />
              </a>
            )}
            {canEdit && (
              <Button onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
          </>
        }
      />

      <Tabs<Tab>
        tabs={[
          { value: "details", label: "Basic details" },
          { value: "interviews", label: "Interview schedule" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "details" ? (
        <Card className="p-5 sm:p-6">
          <RecordFields module={candidatesModule} record={c} role={profile.role} />
        </Card>
      ) : (
        <div className="space-y-6">
          {INTERVIEW_PHASES.map((p) => (
            <PhaseCard key={p.key} candidate={c} phase={p.key} label={p.label} canEdit={canEdit} />
          ))}
          <FinalProcess candidate={c} canEdit={canEdit} />
        </div>
      )}

      {editing && <RecordEditor module={candidatesModule} record={c} onClose={() => setEditing(false)} />}
    </div>
  );
}

// ---------- interview phases ----------

function PhaseCard({ candidate: c, phase, label, canEdit }: { candidate: BaseRecord; phase: string; label: string; canEdit: boolean }) {
  const settings = useSettings();
  const interviews = (c.interviews as Record<string, Interview> | undefined) ?? {};
  const iv = interviews[phase];
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { data: interviewer } = useRecord("employees", iv?.interviewerId ?? null);
  const status = INTERVIEW_STATUS.find((o) => o.value === (iv?.status ?? "pending"));

  const invite = async () => {
    if (!iv) return;
    const lines = [
      `Dear ${c.fullName},`,
      "",
      `Thank you for applying for the ${c.designation} role at ${settings.business.name}. We'd like to invite you to the ${label} interview.`,
      "",
      `Date: ${formatDate(iv.date)}`,
      iv.time ? `Time: ${iv.time}` : "",
      `Mode: ${iv.mode === "online" ? "Online" : "In person"}`,
      iv.mode === "online" && iv.meetingLink ? `Meeting link: ${iv.meetingLink}` : "",
      iv.mode !== "online" ? `Venue: ${iv.venue || settings.business.address}` : "",
      iv.interviewerIdLabel ? `Interviewer: ${iv.interviewerIdLabel}` : "",
      "",
      "Please reply to confirm.",
      "",
      "Regards,",
      settings.business.name,
      settings.business.phone,
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
    const cc = typeof interviewer?.email === "string" && interviewer.email ? `cc=${encodeURIComponent(interviewer.email)}&` : "";
    window.location.href = `mailto:${c.email ?? ""}?${cc}subject=${encodeURIComponent(`${label} interview: ${c.designation} at ${settings.business.name}`)}&body=${encodeURIComponent(lines.join("\n"))}`;
    try {
      await updateRecord("candidates", c.id, { [`interviews.${phase}.invitedAt`]: Date.now() });
    } catch (e) {
      setMessage(friendlyError(e));
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-semibold text-foreground">{label}</h2>
          {iv && status && <Badge tone={status.tone}>{status.label}</Badge>}
          {iv?.invitedAt ? <span className="text-xs text-subtle">Invite sent {formatDate(iv.invitedAt)}</span> : null}
        </div>
        <div className="flex gap-2">
          {iv?.date && (
            <Button size="sm" variant="secondary" onClick={invite} disabled={!c.email}>
              <Send className="size-3.5" /> Send invitation by email
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant={iv ? "ghost" : "primary"} onClick={() => setEditing(true)}>
              {iv ? <Pencil className="size-4" /> : <><CalendarClock className="size-3.5" /> Schedule</>}
            </Button>
          )}
        </div>
      </div>
      {message && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}
      {iv ? (
        <DetailGrid
          items={[
            { label: "Interviewer", value: iv.interviewerIdLabel || "—" },
            { label: "Date and time", value: `${formatDate(iv.date)}${iv.time ? `, ${iv.time}` : ""}` },
            { label: "Mode", value: iv.mode === "online" ? "Online" : "In person" },
            iv.mode === "online"
              ? { label: "Meeting link", value: iv.meetingLink ? <a href={iv.meetingLink} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">{iv.meetingLink}</a> : "—" }
              : { label: "Venue", value: iv.venue || "Office" },
            ...(iv.feedback ? [{ label: "Feedback", value: <span className="whitespace-pre-line">{iv.feedback}</span>, wide: true }] : []),
          ]}
        />
      ) : (
        <p className="text-sm text-muted">Not scheduled yet.</p>
      )}
      {editing && <PhaseEditor candidate={c} phase={phase} label={label} current={iv} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function PhaseEditor({ candidate: c, phase, label, current, onClose }: { candidate: BaseRecord; phase: string; label: string; current?: Interview; onClose: () => void }) {
  const [v, setV] = useState<Interview>(() => ({ mode: "online", status: "pending", date: todayISO(), time: "11:00", ...current }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = (patch: Partial<Interview>) => setV((x) => ({ ...x, ...patch }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { [`interviews.${phase}`]: { ...v, invitedAt: current?.invitedAt ?? null } };
      if (!c.stage || c.stage === "applied") patch.stage = "interviewing";
      if (v.status === "failed" && c.stage !== "hired") patch.stage = "rejected";
      await updateRecord("candidates", c.id, patch);
      onClose();
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`${label} interview`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="phase-form" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <form id="phase-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {message && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 sm:col-span-2 dark:text-red-300">{message}</p>}
        <div className="sm:col-span-2">
          <label htmlFor="pv-int" className={labelClasses}>Interviewer</label>
          <ReferenceSelect id="pv-int" field={INTERVIEWER} value={v.interviewerId ?? ""} label={v.interviewerIdLabel ?? ""} onChange={(val, l) => set({ interviewerId: val || null, interviewerIdLabel: l || null })} />
        </div>
        <div>
          <label htmlFor="pv-date" className={labelClasses}>Date</label>
          <input id="pv-date" type="date" required className={inputClasses} value={v.date ?? ""} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div>
          <label htmlFor="pv-time" className={labelClasses}>Time</label>
          <input id="pv-time" type="time" className={inputClasses} value={v.time ?? ""} onChange={(e) => set({ time: e.target.value })} />
        </div>
        <div>
          <label htmlFor="pv-mode" className={labelClasses}>Mode</label>
          <select id="pv-mode" className={inputClasses} value={v.mode} onChange={(e) => set({ mode: e.target.value as Interview["mode"] })}>
            <option value="online">Online</option>
            <option value="in_person">In person</option>
          </select>
        </div>
        <div>
          <label htmlFor="pv-status" className={labelClasses}>Status</label>
          <select id="pv-status" className={inputClasses} value={v.status} onChange={(e) => set({ status: e.target.value as Interview["status"] })}>
            {INTERVIEW_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {v.mode === "online" ? (
          <div className="sm:col-span-2">
            <label htmlFor="pv-link" className={labelClasses}>Meeting link</label>
            <input id="pv-link" type="url" className={inputClasses} placeholder="https://meet.google.com/…" value={v.meetingLink ?? ""} onChange={(e) => set({ meetingLink: e.target.value })} />
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label htmlFor="pv-venue" className={labelClasses}>Venue</label>
            <input id="pv-venue" className={inputClasses} placeholder="Office address (leave blank for the company address)" value={v.venue ?? ""} onChange={(e) => set({ venue: e.target.value })} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="pv-fb" className={labelClasses}>Feedback</label>
          <textarea id="pv-fb" rows={3} className={inputClasses} value={v.feedback ?? ""} onChange={(e) => set({ feedback: e.target.value })} />
        </div>
      </form>
    </Modal>
  );
}

// ---------- final process ----------

function FinalProcess({ candidate: c, canEdit }: { candidate: BaseRecord; canEdit: boolean }) {
  const profile = useProfile();
  const offer = c.offerLetter as OfferLetter | undefined;
  const [offerOpen, setOfferOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hired = c.stage === "hired";

  const sendOffer = async () => {
    if (!offer) return;
    window.location.href = `mailto:${c.email ?? ""}?subject=${encodeURIComponent(offer.subject)}&body=${encodeURIComponent(offerAsText(offer))}`;
    try {
      await updateRecord("candidates", c.id, { "offerLetter.sentAt": Date.now(), ...(c.stage !== "hired" ? { stage: "offered" } : {}) });
    } catch (e) {
      setMessage(friendlyError(e));
    }
  };

  const convert = async () => {
    if (!window.confirm(`Add ${c.fullName} to the team as Other Staff? An employee record is created now, and they get access when they sign in with Google using ${c.email}.`)) return;
    setConverting(true);
    setMessage(null);
    try {
      const inv = await createInvite(
        {
          email: String(c.email),
          name: String(c.fullName),
          role: "staff",
          employeeDetails: {
            phone: c.phone ?? null,
            designation: offer?.designation ?? c.designation ?? null,
            department: offer?.department || c.department || null,
            joiningDate: offer?.joiningDate || todayISO(),
            dateOfBirth: c.dateOfBirth ?? null,
            address: c.address ?? null,
            candidateId: c.id,
          },
        },
        profile,
      );
      await updateRecord("candidates", c.id, { stage: "hired", employeeId: inv.employeeId, convertedAt: Date.now(), convertedBy: profile.displayName });
      setInvite(inv);
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setConverting(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-base font-semibold text-foreground">Final process</h2>
      <p className="mb-5 text-sm text-muted">Certificates, offer letter and joining.</p>
      {message && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{message}</p>}

      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Certificates</h3>
          <FileList ownerType="candidate" ownerId={c.id} kind="certificate" canEdit={canEdit} emptyText="No certificates uploaded yet." />
        </section>

        <section className="border-t border-line pt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Offer letter</h3>
            {offer?.sentAt ? <Badge tone="violet">Sent {formatDate(offer.sentAt)}</Badge> : offer ? <Badge>Not sent</Badge> : null}
          </div>
          {offer ? (
            <>
              <DetailGrid
                items={[
                  { label: "Designation", value: offer.designation },
                  { label: "CTC (yearly)", value: formatCurrency(offer.ctc) },
                  { label: "Joining date", value: formatDate(offer.joiningDate) },
                  { label: "Reporting to", value: offer.reportingTo || "—" },
                  { label: "Location", value: offer.location || "—" },
                  { label: "Issued", value: `${formatDate(offer.issuedOn)} by ${offer.preparedBy}` },
                ]}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/hr/hiring/offer?id=${c.id}`} className={buttonClasses("secondary", "sm")}>
                  <Printer className="size-3.5" /> View / print
                </Link>
                <Button size="sm" onClick={sendOffer} disabled={!c.email}>
                  <Send className="size-3.5" /> Send offer letter
                </Button>
                {canEdit && !hired && (
                  <Button size="sm" variant="ghost" onClick={() => setOfferOpen(true)}>
                    <Pencil className="size-3.5" /> Change
                  </Button>
                )}
              </div>
            </>
          ) : canEdit ? (
            <Button size="sm" onClick={() => setOfferOpen(true)}>
              <FileSignature className="size-3.5" /> Prepare offer letter
            </Button>
          ) : (
            <p className="text-sm text-muted">No offer yet.</p>
          )}
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Signed offer letter</h3>
          <FileList ownerType="candidate" ownerId={c.id} kind="signedOffer" canEdit={canEdit} multiple={false} emptyText="Upload the scanned copy once the candidate signs it." />
        </section>

        <section className="border-t border-line pt-5">
          {hired ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="size-5" />
              <span className="flex-1">Joined the team{c.convertedAt ? ` on ${formatDate(c.convertedAt)}` : ""}.</span>
              {typeof c.employeeId === "string" && canRead(profile.role, "employees") && (
                <Link href={`/hr/employees/view?id=${c.employeeId}`} className="font-medium underline">Open employee record</Link>
              )}
            </div>
          ) : (
            canEdit && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted">
                  {offer ? "When certificates are checked and the signed offer is in, add them to the team." : "Prepare the offer letter first."}
                </p>
                <Button onClick={convert} disabled={!offer || converting || !c.email}>
                  <UserCheck className="size-4" /> {converting ? "Adding…" : "Verified and convert to team member"}
                </Button>
              </div>
            )
          )}
          {invite && (
            <div className="mt-4 space-y-3 rounded-xl border border-line p-4 text-sm">
              <p className="text-body">
                Done. {String(c.fullName)} gets the Other Staff role when they sign in with Google using <strong className="text-foreground">{invite.email}</strong>. Send them the link:
              </p>
              <ShareInvite invite={invite} />
            </div>
          )}
        </section>
      </div>

      {offerOpen && <OfferEditor candidate={c} current={offer} onClose={() => setOfferOpen(false)} />}
    </Card>
  );
}

function OfferEditor({ candidate: c, current, onClose }: { candidate: BaseRecord; current?: OfferLetter; onClose: () => void }) {
  const profile = useProfile();
  const settings = useSettings();
  const [v, setV] = useState<OfferInput>(() => ({
    designation: current?.designation ?? String(c.designation ?? ""),
    department: current?.department ?? String(c.department ?? ""),
    ctc: current?.ctc ?? (Number(c.expectedCtc) || 0),
    joiningDate: current?.joiningDate ?? todayISO(),
    reportingTo: current?.reportingTo ?? "",
    location: current?.location ?? "Kozhikode office",
    probationMonths: current?.probationMonths ?? settings.offer.probationMonths,
    noticePeriodDays: current?.noticePeriodDays ?? settings.offer.noticePeriodDays,
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = (patch: Partial<OfferInput>) => setV((x) => ({ ...x, ...patch }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const letter = buildOfferLetter(v, String(c.fullName), settings.offer, settings.business, profile.displayName, todayISO());
      await updateRecord("candidates", c.id, { offerLetter: letter, stage: c.stage === "hired" ? c.stage : "offered" });
      onClose();
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const text = (key: keyof OfferInput, label: string, type = "text") => (
    <div>
      <label htmlFor={`of-${key}`} className={labelClasses}>{label}</label>
      <input
        id={`of-${key}`}
        type={type}
        className={inputClasses}
        value={String(v[key] ?? "")}
        onChange={(e) => set({ [key]: type === "number" ? Number(e.target.value) : e.target.value } as Partial<OfferInput>)}
        required={key === "designation" || key === "joiningDate" || key === "ctc"}
      />
    </div>
  );

  return (
    <Modal
      open
      wide
      title={current ? "Change offer letter" : "Prepare offer letter"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="offer-form" disabled={saving}>{saving ? "Saving…" : "Save offer letter"}</Button>
        </>
      }
    >
      <form id="offer-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {message && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 sm:col-span-2 dark:text-red-300">{message}</p>}
        <p className="text-sm text-muted sm:col-span-2">
          The wording comes from Settings → Offer letter. These details fill in the blanks, and the finished letter is saved with the candidate.
        </p>
        {text("designation", "Designation")}
        {text("department", "Department")}
        {text("ctc", "CTC (yearly, ₹)", "number")}
        {text("joiningDate", "Joining date", "date")}
        {text("reportingTo", "Reporting to")}
        {text("location", "Work location")}
        {text("probationMonths", "Probation (months)", "number")}
        {text("noticePeriodDays", "Notice period (days)", "number")}
        <p className={cn("text-xs text-subtle sm:col-span-2")}>Monthly: {formatCurrency(Math.round((Number(v.ctc) || 0) / 12))}</p>
      </form>
    </Modal>
  );
}
