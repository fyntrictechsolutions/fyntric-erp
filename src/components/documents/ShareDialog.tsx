"use client";

import { Check, Copy, Link2Off, Mail, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { friendlyError } from "@/components/resource/RecordEditor";
import { useSettings } from "@/components/settings/SettingsProvider";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { inputClasses, labelClasses } from "@/components/ui/fieldStyles";
import { useLiveQuery } from "@/hooks/useCollection";
import { collection, doc, getDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { highlightsFrom, KINDS, PROFILE_ID, shareDoc, stopSharing, type SalesDoc } from "@/lib/salesDocs";
import { joinLines, mailHref, whatsAppHref } from "@/lib/share";

export interface Recipient {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Case studies, for the profile's portfolio highlights and the intro pack. */
export function useCaseStudies() {
  return useLiveQuery<SalesDoc>(() => query(collection(db(), "documents"), where("kind", "==", "case_study")), "documents:case_study");
}

/** The message and the three ways to send it. */
function SendButtons({ to, subject, text }: { to?: Recipient; subject: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <a href={whatsAppHref(to?.phone, text)} target="_blank" rel="noreferrer" className={buttonClasses("primary")}>
        <MessageCircle className="size-4" /> WhatsApp
      </a>
      <a href={mailHref(to?.email, subject, text)} className={buttonClasses("secondary")}>
        <Mail className="size-4" /> Email
      </a>
      <Button
        variant="secondary"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy message"}
      </Button>
    </div>
  );
}

/** Makes (or refreshes) the document's link, then offers WhatsApp, email or copy with a short message. */
export function ShareDialog({ doc: d, to, onClose }: { doc: SalesDoc; to?: Recipient; onClose: () => void }) {
  const settings = useSettings();
  const caseStudies = useCaseStudies();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const waitingForCases = d.kind === "profile" && caseStudies.loading;

  useEffect(() => {
    if (waitingForCases) return;
    let live = true;
    shareDoc(d, settings.business, d.id === PROFILE_ID ? highlightsFrom(caseStudies.data) : undefined)
      .then((url) => {
        if (!live) return;
        setLink(url);
        setMessage(
          joinLines([
            `Hello${to?.name ? ` ${to.name}` : ""},`,
            "",
            `Please find our ${KINDS[d.kind].label.toLowerCase()}${d.kind === "case_study" || d.kind === "profile" ? "" : ` (${d.number ?? d.title})`} here:`,
            url,
            "",
            d.kind === "proposal" ? "Please review it and let us know if you'd like any changes. To accept it, sign the last page and send it back to us." : "",
            d.kind === "nda" || d.kind === "agreement" ? "Please review it, sign where marked and send us a copy." : "",
            d.kind === "questionnaire" ? "Answering these helps us understand your requirements before we prepare the proposal." : "",
            "",
            "Regards,",
            settings.business.name,
          ]),
        );
      })
      .catch((e) => live && setError(friendlyError(e)));
    return () => {
      live = false;
    };
    // Share once per opening, after the case studies are loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForCases]);

  const stop = async () => {
    if (!window.confirm("Stop sharing? The link stops working for anyone who has it.")) return;
    try {
      await stopSharing({ ...d, shareToken: d.shareToken ?? link?.split("t=")[1] ?? null });
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Modal open onClose={onClose} title={`Share ${d.title}`}>
      {error ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : !link ? (
        <p className="text-sm text-muted">Making the link…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">Anyone with this link can view the document and save it as a PDF. It shows the latest version each time you share it.</p>
          <div>
            <label htmlFor="share-msg" className={labelClasses}>Message</label>
            <textarea id="share-msg" rows={9} className={inputClasses} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <SendButtons to={to} subject={`${d.title} from ${settings.business.name}`} text={message} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
            <a href={link} target="_blank" rel="noreferrer" className="truncate text-accent hover:underline">{link}</a>
            <button type="button" onClick={stop} className="inline-flex items-center gap-1 text-muted hover:text-red-600">
              <Link2Off className="size-3.5" /> Stop sharing
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * The first email to a lead: the company profile plus the case studies that match. Matching ones (same
 * services as the lead) start ticked. Shares each one and builds a single message with all the links.
 */
export function IntroPackDialog({ to, services, onClose }: { to: Recipient; services: string[]; onClose: () => void }) {
  const settings = useSettings();
  const cases = useCaseStudies();
  const list = [...cases.data].sort((a, b) => a.title.localeCompare(b.title));
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const chosen = picked ?? new Set(list.filter((c) => (c.services ?? []).some((s) => services.includes(s))).map((c) => c.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const profileSnap = await getDoc(doc(db(), "documents", PROFILE_ID));
      if (!profileSnap.exists()) throw new Error("Set up the company profile first: Sales → Documents → Company profile.");
      // Case studies first, so the profile's highlights link to them.
      const links: string[] = [];
      const shared = new Map<string, string>();
      for (const c of list.filter((x) => chosen.has(x.id))) {
        const url = await shareDoc(c, settings.business);
        shared.set(c.id, url);
        links.push(`• ${c.title}: ${url}`);
      }
      const withLinks = list.map((c) => (shared.has(c.id) ? { ...c, shareToken: shared.get(c.id)!.split("t=")[1] } : c));
      const profileUrl = await shareDoc({ id: profileSnap.id, ...profileSnap.data() } as SalesDoc, settings.business, highlightsFrom(withLinks));
      setMessage(
        joinLines([
          `Hello${to.name ? ` ${to.name}` : ""},`,
          "",
          `Thank you for your interest in ${settings.business.name}. Here is our company profile:`,
          profileUrl,
          ...(links.length ? ["", `And ${links.length === 1 ? "a case study" : "case studies"} of similar work we've done:`, ...links] : []),
          "",
          "Happy to set up a call to understand your requirements.",
          "",
          "Regards,",
          settings.business.name,
        ]),
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Send company profile"
      footer={
        message ? undefined : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void build()} disabled={busy || cases.loading}>{busy ? "Preparing links…" : "Next"}</Button>
          </>
        )
      }
    >
      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {message === null ? (
        <div className="space-y-3">
          <p className="text-sm text-body">The company profile goes with every intro. Tick the case studies that match this lead{services.length ? " (ones for the same services are ticked already)" : ""}.</p>
          {list.length === 0 ? (
            <p className="text-sm text-muted">{cases.loading ? "Loading…" : "No case studies yet. Add them in Sales → Documents."}</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {list.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm">
                    <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{c.title}</span>
                      {c.summary && <span className="block text-xs text-muted">{c.summary}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="intro-msg" className={labelClasses}>Message</label>
            <textarea id="intro-msg" rows={12} className={inputClasses} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <SendButtons to={to} subject={`${settings.business.name}: company profile`} text={message} />
        </div>
      )}
    </Modal>
  );
}
