"use client";

import Image from "next/image";
import logoColor from "@/assets/brand/logo-color.png";
import type { LineItem } from "@/config/modules/types";
import type { BusinessSettings } from "@/config/settingsDefaults";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate } from "@/lib/format";
import { amountInWords } from "@/lib/amountInWords";
import { groupedTotals } from "@/lib/lineItems";
import { QrCode } from "@/components/ui/QrCode";
import { amcBase, blockHours, blockTotal, DEFAULT_AMC, isHourly, KINDS, proposalTotal, rowRate, type CostBlock, type DocFields, type SharedCopy } from "@/lib/salesDocs";

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
                  {s.heading && (
                    <h2 className={cn("text-[17px] font-semibold", proposal ? "border-b border-[#1e3a8a]/40 pb-1 text-[#1e3a8a]" : "text-slate-900")}>
                      {n ? `${n}. ` : ""}
                      {s.heading}
                    </h2>
                  )}
                  {proposal && i === payIndex && <Milestones d={d} total={total} />}
                  {(() => {
                    // "[price]" on a line of its own places the price there; otherwise it follows the text.
                    const [before, after] = i === invIndex ? text.split(/^\s*\[price\]\s*$/m) : [text];
                    return (
                      <>
                        <Body text={before} className="mt-2" num={n} />
                        {i === invIndex && <Price d={d} total={total} />}
                        {after !== undefined && <Body text={after} className="mt-3" num={n} />}
                      </>
                    );
                  })()}
                  {proposal && i === payIndex && d.showPaymentMethods !== false && <PaymentMethods d={d} b={b} />}
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
  const base = amcBase(d);
  const rate = d.costBlocks?.[0]?.rate;
  const days = d.date && d.validUntil ? Math.round((new Date(`${d.validUntil}T00:00:00`).getTime() - new Date(`${d.date}T00:00:00`).getTime()) / 86400000) : null;
  return {
    total: total !== null ? formatCurrency(total) : "the total project cost",
    amcPercent: String(amc),
    amcAmount: base !== null ? formatCurrency(Math.round((base * amc) / 100)) : `${amc}% of the development cost`,
    amcBase: base !== null ? formatCurrency(base) : "the development cost",
    rate: rate ? formatCurrency(rate) : "our hourly rate",
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
                <tr>
                  {head.map((c, j) => <th key={j} className={TH}>{inline(c)}</th>)}
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

const TH = "border border-[#1e3a8a] bg-[#1e3a8a] px-2.5 py-1.5 font-semibold text-white";
const TD = "border border-slate-200 px-2.5 py-1.5";
const TOTAL_ROW = "bg-slate-100 font-semibold text-slate-900";

/** The price: hours per task (hourly) or the estimate's lines, then the summary and the total in a box. */
function Price({ d, total }: { d: DocFields; total: number | null }) {
  const hourly = isHourly(d);
  const lines = !hourly && Boolean(d.items?.length) && d.showItems !== false;
  if (!hourly && !lines && total === null) return null;
  const blocks = hourly ? d.costBlocks! : [];
  return (
    <div className="mt-4 space-y-5">
      {blocks.map((b, i) => (
        <HoursTable key={i} block={b} title={i > 0 ? b.title : ""} />
      ))}
      {blocks.length > 1 && (
        <div className="print-keep">
          <p className="text-sm font-semibold text-slate-900">Summary</p>
          <table className="mt-1.5 w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className={TH}>Item</th>
                <th className={cn(TH, "text-right")}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => (
                <tr key={i}>
                  <td className={TD}>
                    {b.summary || b.title} ({blockHours(b)} hours{sameRate(b) ? ` × ${formatCurrency(b.rate)}` : ""})
                  </td>
                  <td className={cn(TD, "text-right tabular-nums")}>{formatCurrency(blockTotal(b))}</td>
                </tr>
              ))}
              <tr className={TOTAL_ROW}>
                <td className={TD}>Total project cost</td>
                <td className={cn(TD, "text-right tabular-nums")}>{formatCurrency(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {lines && <PriceTable d={d} />}
      {total !== null && (
        <div className="print-keep rounded-xl border-2 border-[#1e3a8a] px-5 py-4 text-center">
          <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Total project cost</p>
          <p className="mt-1 text-3xl font-semibold text-[#1e3a8a] tabular-nums">{formatCurrency(total)}</p>
          <p className="mt-0.5 text-sm text-slate-600">Indian {amountInWords(total)}</p>
        </div>
      )}
    </div>
  );
}

const sameRate = (b: CostBlock) => b.rows.every((r) => r.heading || rowRate(b, r) === Number(b.rate));

/** Task-wise hours, rate and amount, with group headings and a total row. */
function HoursTable({ block: b, title }: { block: CostBlock; title: string }) {
  const rows = b.rows.filter((r) => r.task.trim() || r.hours);
  return (
    <div>
      {title && <p className="mb-1.5 text-sm font-semibold text-slate-900">{title}</p>}
      <table className="w-full border-collapse text-left text-sm">
        <thead className="table-header-group">
          <tr>
            <th className={TH}>Task</th>
            <th className={cn(TH, "w-16 text-right")}>Hours</th>
            <th className={cn(TH, "w-24 text-right")}>Rate / hr</th>
            <th className={cn(TH, "w-28 text-right")}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) =>
            r.heading ? (
              <tr key={i} className="bg-blue-50">
                <td colSpan={4} className={cn(TD, "font-semibold text-[#1e3a8a]")}>{r.task}</td>
              </tr>
            ) : (
              <tr key={i} className="align-top">
                <td className={TD}>{r.task}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{Number(r.hours) || 0}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{formatCurrency(rowRate(b, r))}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{formatCurrency((Number(r.hours) || 0) * rowRate(b, r))}</td>
              </tr>
            ),
          )}
          <tr className={TOTAL_ROW}>
            <td className={TD}>Total {(b.title || "development").replace(/\s*\(.*\)\s*$/, "").toLowerCase()}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{blockHours(b)}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{sameRate(b) ? formatCurrency(b.rate) : ""}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{formatCurrency(blockTotal(b))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Payment milestones with each one's amount: per block when priced by the hour. */
function Milestones({ d, total }: { d: DocFields; total: number | null }) {
  const groups: { title: string; base: number | null; list: { label: string; percent: number }[] }[] = isHourly(d)
    ? d.costBlocks!.map((b) => ({ title: b.title, base: blockTotal(b), list: b.milestones ?? [] }))
    : [{ title: "", base: total, list: d.milestones ?? [] }];
  const shown = groups.map((g) => ({ ...g, list: g.list.filter((m) => m.label || m.percent) })).filter((g) => g.list.length);
  if (!shown.length) return null;
  const withAmounts = shown.some((g) => g.base !== null);
  const amount = (base: number | null, p: number) => (base !== null ? formatCurrency(Math.round((base * p) / 100)) : "");
  const many = shown.length > 1;
  return (
    <table className="print-keep mt-2 w-full border-collapse text-left text-sm">
      <thead>
        <tr>
          <th className={TH}>Milestone</th>
          <th className={cn(TH, "w-28 text-right")}>Percentage</th>
          {withAmounts && <th className={cn(TH, "w-32 text-right")}>Amount</th>}
        </tr>
      </thead>
      <tbody>
        {shown.map((g, gi) => {
          const sum = g.list.reduce((t, m) => t + (Number(m.percent) || 0), 0);
          return [
            ...g.list.map((m, i) => (
              <tr key={`${gi}-${i}`}>
                <td className={TD}>{m.label}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{m.percent}%</td>
                {withAmounts && <td className={cn(TD, "text-right tabular-nums")}>{amount(g.base, Number(m.percent) || 0)}</td>}
              </tr>
            )),
            (!many || gi === 0) && (
              <tr key={`${gi}-t`} className={TOTAL_ROW}>
                <td className={TD}>{many ? `${(g.title || "Development").replace(/\s*\(.*\)\s*$/, "")} total` : "Total"}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{sum}%</td>
                {withAmounts && <td className={cn(TD, "text-right tabular-nums")}>{amount(g.base, sum)}</td>}
              </tr>
            ),
          ];
        })}
        {many && (
          <tr className={TOTAL_ROW}>
            <td className={TD}>Grand total</td>
            <td className={TD} />
            {withAmounts && <td className={cn(TD, "text-right tabular-nums")}>{formatCurrency(total)}</td>}
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** Bank and UPI details from Settings, with a QR code for UPI apps. */
function PaymentMethods({ d, b }: { d: DocFields; b: Business }) {
  const bank = [
    { label: "Account name", value: b.accountName },
    { label: "Bank", value: b.bankName },
    { label: "Account number", value: b.accountNumber },
    { label: "IFSC", value: b.ifsc },
  ].filter((r) => r.value);
  const upi = b.upiId?.trim();
  if (!bank.length && !upi) return null;
  const upiLink = upi ? `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(b.accountName || b.name)}&cu=INR${d.number ? `&tn=${encodeURIComponent(d.number)}` : ""}` : "";
  return (
    <div className="print-keep mt-5">
      <p className="text-sm font-semibold text-slate-900">Payment methods</p>
      <div className="mt-1.5 flex flex-col gap-5 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          {bank.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-[#1e3a8a]">Bank transfer</p>
              <table className="mt-1.5 w-full border-collapse text-left text-sm">
                <tbody>
                  {bank.map((r) => (
                    <tr key={r.label}>
                      <td className={cn(TD, "w-36 text-slate-500")}>{r.label}</td>
                      <td className={cn(TD, "font-semibold text-slate-900")}>{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {upi && (
            <div>
              <p className="text-sm font-semibold text-[#1e3a8a]">UPI</p>
              <p className="mt-1 text-sm text-slate-700">
                UPI ID: <strong className="font-semibold text-slate-900">{upi}</strong> (scan the QR code with any UPI app)
              </p>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Please mention the quotation number{d.number ? ` ${d.number}` : ""} as the payment reference and share the payment confirmation with us.
          </p>
        </div>
        {upi && (
          <figure className="shrink-0 self-center text-center">
            <QrCode value={upiLink} size={150} />
            <figcaption className="mt-1 text-xs text-slate-500">Scan to pay · {upi}</figcaption>
          </figure>
        )}
      </div>
    </div>
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
