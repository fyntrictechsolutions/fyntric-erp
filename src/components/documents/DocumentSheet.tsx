"use client";

import Image from "next/image";
import logoColor from "@/assets/brand/logo-color.png";
import type { LineItem } from "@/config/modules/types";
import type { BusinessSettings } from "@/config/settingsDefaults";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate } from "@/lib/format";
import { amountInWords } from "@/lib/amountInWords";
import { groupedTotals } from "@/lib/lineItems";
import { DEFAULT_AMC, KINDS, proposalTotal, type DocFields, type SharedCopy } from "@/lib/salesDocs";

type Business = SharedCopy["business"] | BusinessSettings;

/**
 * One sales document as paper, used in the app and on the shared link. It takes everything as props
 * (no app settings), so the public page can show the same thing from its shared copy.
 */
export function DocumentSheet({
  doc: d,
  business: b,
  highlights,
}: {
  doc: DocFields;
  business: Business;
  highlights?: SharedCopy["highlights"];
}) {
  const kind = KINDS[d.kind];
  const library = d.kind === "profile" || d.kind === "case_study";
  const proposal = d.kind === "proposal";
  const total = proposal ? proposalTotal(d) : null;
  // Proposals: the price goes under "Project investment" (or else just before the payment terms, or at the end),
  // and the milestone table under "Payment terms".
  const invIndex = proposal ? d.sections.findIndex((s) => /investment|project cost|price|quotation/i.test(s.heading)) : -1;
  const payIndex = proposal ? d.sections.findIndex((s) => /payment/i.test(s.heading)) : -1;
  const priceAt = !proposal ? -1 : invIndex >= 0 ? -1 : payIndex >= 0 ? payIndex : d.sections.length;
  const tokens = proposal ? proposalTokens(d, total) : {};
  return (
    <article className={cn("print-sheet mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-card sm:p-12", !library && "doc-paged")}>
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        {b.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- small data URL from settings
          <img src={b.logo} alt={b.name} className="h-10 w-auto max-w-[220px] object-contain object-left" />
        ) : (
          <Image src={logoColor} alt={b.name} className="h-10 w-auto" sizes="200px" />
        )}
        <div className="text-sm text-slate-600 sm:text-right">
          <p className="font-semibold text-slate-900">{b.name}</p>
          <p className="max-w-xs whitespace-pre-line">{b.address}</p>
          <p>{[b.phone, b.email].filter(Boolean).join(" · ")}</p>
          {b.website && <p>{b.website.replace(/^https?:\/\//, "")}</p>}
        </div>
      </header>

      <div className="mt-8">
        {!library && !proposal && <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{kind.label}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{d.title}</h1>
        {proposal && d.subtitle && <p className="mt-1 text-base text-slate-600">{d.subtitle}</p>}
        {d.kind === "case_study" && d.summary && <p className="mt-2 text-base text-slate-600">{d.summary}</p>}
        {proposal ? (
          <dl className="mt-5 grid overflow-hidden rounded-lg border border-slate-200 text-sm sm:grid-cols-2">
            {[
              { label: "Quotation no.", value: d.number },
              { label: "Date", value: d.date ? formatDate(d.date) : "" },
              { label: "Prepared for", value: d.party?.name },
              { label: "Valid until", value: d.validUntil ? `${formatDate(d.validUntil)}${tokens.validDays ? ` (${tokens.validDays} days)` : ""}` : "" },
              { label: "Revision", value: `Rev. ${d.version ?? 1}${d.revisionNote ? ` (${d.revisionNote})` : ""}` },
              ...(d.facts ?? []),
            ]
              .filter((f) => f.value)
              .map((f, i) => (
                <div key={i} className="flex gap-3 border-b border-slate-200 px-3 py-2 sm:odd:border-r">
                  <dt className="w-28 shrink-0 text-slate-500">{f.label}</dt>
                  <dd className="font-medium text-slate-900">{f.value}</dd>
                </div>
              ))}
          </dl>
        ) : (
          !library && (
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {d.number && <Meta label="Ref." value={d.number} />}
              {d.date && <Meta label="Date" value={formatDate(d.date)} />}
              {d.party?.name && <Meta label="With" value={d.party.name} />}
            </dl>
          )
        )}
      </div>

      {d.kind === "case_study" && d.images && d.images.length > 0 && (
        <div className={cn("mt-6 grid gap-3", d.images.length > 1 && "sm:grid-cols-2")}>
          {d.images.map((img) => (
            <figure key={img.path} className="print-keep">
              {/* eslint-disable-next-line @next/next/no-img-element -- stored screenshots */}
              <img src={img.url} alt={img.caption || d.title} className="w-full rounded-lg border border-slate-200 object-cover" />
              {img.caption && <figcaption className="mt-1 text-xs text-slate-500">{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {d.kind === "questionnaire" ? (
        <ol className="mt-8 space-y-5">
          {d.sections.map((s, i) => (
            <li key={i} className="print-keep">
              <p className="text-sm font-semibold text-slate-900">
                {i + 1}. {s.heading}
              </p>
              {s.body ? <Body text={s.body} className="mt-1" /> : <div className="mt-2 h-14 rounded border border-dashed border-slate-300" />}
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-8 space-y-7">
          {d.sections.map((s, i) => {
            const n = numbered(d.kind) ? `${i + 1}` : "";
            const text = proposal ? fillTokens(s.body, tokens) : s.body;
            return (
              <div key={i} className="space-y-7">
                {i === priceAt && <Price d={d} total={total} />}
                <section>
                  {s.heading && <h2 className="text-[17px] font-semibold text-slate-900">{n ? `${n}. ` : ""}{s.heading}</h2>}
                  {proposal && i === payIndex && <Milestones d={d} total={total} />}
                  <Body text={text} className="mt-2" num={n} />
                  {i === invIndex && <Price d={d} total={total} />}
                </section>
              </div>
            );
          })}
          {priceAt === d.sections.length && <Price d={d} total={total} />}
        </div>
      )}

      {d.kind === "profile" && highlights && highlights.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-slate-900">Portfolio highlights</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {highlights.map((h, i) => (
              <li key={i} className="print-keep overflow-hidden rounded-xl border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element -- stored screenshots */}
                {h.image && <img src={h.image} alt={h.title} className="h-36 w-full object-cover" />}
                <div className="p-3">
                  <p className="font-medium text-slate-900">{h.link ? <a href={h.link} className="hover:underline">{h.title}</a> : h.title}</p>
                  {h.summary && <p className="mt-0.5 text-sm text-slate-600">{h.summary}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.kind === "profile" && (
        <section className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-700">
          <h2 className="text-base font-semibold text-slate-900">Contact us</h2>
          <p className="mt-1 whitespace-pre-line">{b.address}</p>
          <p className="mt-1">{[b.phone, b.email, b.website?.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ")}</p>
        </section>
      )}

      {d.kind === "proposal" && <Acceptance d={d} b={b} />}
      {(d.kind === "nda" || d.kind === "agreement") && <Signatures d={d} b={b} />}
    </article>
  );
}

const numbered = (kind: DocFields["kind"]) => kind === "nda" || kind === "agreement" || kind === "proposal";

/** Values worked out from the proposal, for {total}, {amcAmount}, {amcPercent}, {validDays} and {ref} in its text. */
function proposalTokens(d: DocFields, total: number | null): Record<string, string> {
  const amc = d.amcPercent ?? DEFAULT_AMC;
  const days = d.date && d.validUntil ? Math.round((new Date(`${d.validUntil}T00:00:00`).getTime() - new Date(`${d.date}T00:00:00`).getTime()) / 86400000) : null;
  return {
    total: total !== null ? formatCurrency(total) : "the total project cost",
    amcPercent: String(amc),
    amcAmount: total !== null ? formatCurrency(Math.round((total * amc) / 100)) : `${amc}% of the total project cost`,
    validDays: days !== null && days > 0 ? String(days) : "",
    ref: `${d.number ?? ""}, Rev. ${d.version ?? 1}`,
  };
}

const fillTokens = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (values[k] ? values[k] : m));

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline text-slate-500">{label} </dt>
      <dd className="inline font-medium text-slate-900">{value}</dd>
    </div>
  );
}

/**
 * Plain text with light formatting: blank lines split paragraphs, "- " lines are bullets, "1. " lines are
 * numbered, "## " starts a sub-heading (numbered 3.1, 3.2… under section 3), "| a | b |" lines make a table
 * (the first row is the header), "> " lines are a note, and **text** is bold.
 */
export function Body({ text, className, num }: { text: string; className?: string; num?: string }) {
  const blocks = text
    .replace(/^(##\s+.*)$/gm, "\n$1\n")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").filter((l) => l.trim()))
    .filter((l) => l.length);
  const isSub = (lines: string[]) => lines.length === 1 && /^##\s+/.test(lines[0]);
  const subNo = blocks.map((_, i) => blocks.slice(0, i + 1).filter(isSub).length);
  return (
    <div className={cn("space-y-3 text-[15px] leading-7 text-slate-700", className)}>
      {blocks.map((lines, i) => {
        if (isSub(lines)) {
          return (
            <h3 key={i} className="pt-2 text-[15px] font-semibold text-slate-900">
              {num ? `${num}.${subNo[i]} ` : ""}
              {lines[0].replace(/^##\s+/, "")}
            </h3>
          );
        }
        if (lines.every((l) => /^\s*\|/.test(l))) {
          const rows = lines.map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
          const [head, ...body] = rows;
          return (
            <table key={i} className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-900">
                  {head.map((c, j) => <th key={j} className="border border-slate-200 px-2.5 py-1.5 font-semibold">{inline(c)}</th>)}
                </tr>
              </thead>
              <tbody>
                {body.map((r, j) => (
                  <tr key={j} className="align-top">
                    {head.map((_, k) => <td key={k} className={cn("border border-slate-200 px-2.5 py-1.5", k === 0 && "font-medium text-slate-900")}>{inline(r[k] ?? "")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        if (lines.every((l) => /^\s*>/.test(l)))
          return (
            <p key={i} className="print-keep rounded-md border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600 italic">
              {inline(lines.map((l) => l.replace(/^\s*>\s?/, "")).join(" "))}
            </p>
          );
        if (lines.every((l) => /^\s*[-•*]\s+/.test(l)))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-•*]\s+/, ""))}</li>)}
            </ul>
          );
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}
            </ol>
          );
        return <p key={i} className="whitespace-pre-line">{inline(lines.join("\n"))}</p>;
      })}
    </div>
  );
}

/** **bold** inside a line. */
function inline(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.length === 1 ? text : parts.map((p, i) => (i % 2 ? <strong key={i} className="font-semibold text-slate-900">{p}</strong> : p));
}

/** The total project cost in a box, with the estimate's lines above it when chosen. */
function Price({ d, total }: { d: DocFields; total: number | null }) {
  const lines = Boolean(d.items?.length) && d.showItems !== false;
  if (!lines && total === null) return null;
  return (
    <div className="mt-4 space-y-4">
      {lines && <PriceTable d={d} />}
      {total !== null && (
        <div className="print-keep rounded-xl border-2 border-slate-900 px-5 py-4 text-center">
          <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Total project cost</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900 tabular-nums">{formatCurrency(total)}</p>
          <p className="mt-0.5 text-sm text-slate-600">Indian {amountInWords(total)}</p>
        </div>
      )}
    </div>
  );
}

/** Payment milestones with each one's amount. */
function Milestones({ d, total }: { d: DocFields; total: number | null }) {
  const list = (d.milestones ?? []).filter((m) => m.label || m.percent);
  if (!list.length) return null;
  const sum = list.reduce((t, m) => t + (Number(m.percent) || 0), 0);
  const amount = (p: number) => (total !== null ? formatCurrency(Math.round((total * p) / 100)) : "");
  return (
    <table className="print-keep mt-2 w-full border-collapse text-left text-sm">
      <thead>
        <tr className="bg-slate-100 text-slate-900">
          <th className="border border-slate-200 px-2.5 py-1.5 font-semibold">Milestone</th>
          <th className="border border-slate-200 px-2.5 py-1.5 text-right font-semibold">Percentage</th>
          {total !== null && <th className="border border-slate-200 px-2.5 py-1.5 text-right font-semibold">Amount</th>}
        </tr>
      </thead>
      <tbody>
        {list.map((m, i) => (
          <tr key={i}>
            <td className="border border-slate-200 px-2.5 py-1.5">{m.label}</td>
            <td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{m.percent}%</td>
            {total !== null && <td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{amount(Number(m.percent) || 0)}</td>}
          </tr>
        ))}
        <tr className="font-semibold text-slate-900">
          <td className="border border-slate-200 px-2.5 py-1.5">Total</td>
          <td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{sum}%</td>
          {total !== null && <td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{amount(sum)}</td>}
        </tr>
      </tbody>
    </table>
  );
}

function PriceTable({ d }: { d: DocFields }) {
  const groups = groupedTotals(d.items as LineItem[], { once: d.discountOnce, annually: d.discountAnnually, monthly: d.discountMonthly });
  return (
    <section className="print-keep">
      <p className="text-sm font-semibold text-slate-900">Breakdown{d.estimateNumber ? ` (from estimate ${d.estimateNumber})` : ""}</p>
      {groups.map((g) => (
        <div key={g.key} className="mt-3">
          {groups.length > 1 && <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{g.label}</p>}
          <table className="mt-1 w-full text-left text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase">
                <th className="px-2 py-1.5 font-medium">Item</th>
                <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                <th className="px-2 py-1.5 text-right font-medium">Rate</th>
                <th className="px-2 py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {g.items.map(({ item: it, index }) => (
                <tr key={index} className="align-top">
                  <td className="px-2 py-2">
                    <p className="font-medium text-slate-900">{it.name}</p>
                    {it.description && <p className="text-xs whitespace-pre-line text-slate-500">{it.description}</p>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{it.qty}{it.unit ? ` ${it.unit}` : ""}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(it.rate)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-2 ml-auto w-full max-w-xs space-y-1 text-sm">
            <Row label="Subtotal" value={g.subtotal} />
            {g.discount > 0 && <Row label="Discount" value={-g.discount} />}
            {g.taxTotal > 0 && <Row label="GST" value={g.taxTotal} />}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
              <dt>Total{g.per}</dt>
              <dd className="tabular-nums">{formatCurrency(g.total)}</dd>
            </div>
          </dl>
        </div>
      ))}
    </section>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatCurrency(value)}</dd>
    </div>
  );
}

function SignLine({ label, value, tall }: { label: string; value?: string | null; tall?: boolean }) {
  return (
    <div className="text-sm">
      <span className={cn("block border-b border-slate-300 pb-0.5 text-slate-900", tall ? "min-h-16" : "min-h-7")}>{value}</span>
      <span className="mt-1 block text-xs text-slate-500">{label}</span>
    </div>
  );
}

/** The declaration page at the end of a proposal: the client signs it to accept scope, price and terms. */
function Acceptance({ d, b }: { d: DocFields; b: Business }) {
  return (
    <section className="mt-10 border-t-2 border-slate-900 pt-6 print:break-before-page print:border-t-0 print:pt-0">
      <h2 className="text-[17px] font-semibold text-slate-900">{d.sections.length + 1}. Acceptance</h2>
      <p className="mt-2 text-[15px] leading-7 text-slate-700">By signing below, both parties agree to the scope, timeline and commercial terms in this document.</p>
      <div className="mt-5 rounded-xl border border-slate-300 p-4">
        <p className="text-sm font-semibold text-slate-900">Client declaration</p>
        <p className="mt-1.5 text-[15px] leading-7 text-slate-700">
          I, the undersigned, on behalf of {d.party?.name || "the Client"}, confirm that I have read and understood this Scope of Work and Quotation
          {d.number ? ` (Quotation No. ${d.number}, Rev. ${d.version ?? 1})` : ""}, including the scope, out-of-scope items, timeline, payment terms, third-party costs, support and AMC terms. I approve it and
          authorize {b.name} to start the project on these terms.
        </p>
      </div>
      <div className="mt-8 grid gap-10 sm:grid-cols-2">
        <div className="space-y-5">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">For {b.name}</p>
          <SignLine label="Authorized signature" />
          <SignLine label="Name & designation" />
          <SignLine label="Date" />
        </div>
        <div className="space-y-5">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">For the client (declaration accepted)</p>
          <SignLine label="Client / company name" value={d.party?.name} />
          <SignLine label="Authorized signatory name & designation" value={[d.signedBy, d.signedTitle].filter(Boolean).join(", ")} />
          <SignLine label="Signature & company seal" tall />
          <SignLine label="Date & place" value={d.signedOn ? formatDate(d.signedOn) : ""} />
        </div>
      </div>
    </section>
  );
}

function Signatures({ d, b }: { d: DocFields; b: Business }) {
  return (
    <section className="print-keep mt-10 border-t border-slate-200 pt-6">
      <p className="text-sm text-slate-700">Signed by the authorised representatives of the parties on the dates below.</p>
      <div className="mt-6 grid gap-10 sm:grid-cols-2">
        <div className="space-y-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">For {b.name}</p>
          <SignLine label="Name" />
          <SignLine label="Designation" />
          <SignLine label="Date" />
          <SignLine label="Signature" />
        </div>
        <div className="space-y-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">For {d.party?.name || "the Client"}</p>
          <SignLine label="Name" value={d.signedBy} />
          <SignLine label="Designation" value={d.signedTitle} />
          <SignLine label="Date" value={d.signedOn ? formatDate(d.signedOn) : ""} />
          <SignLine label="Signature" />
        </div>
      </div>
    </section>
  );
}
