import Image from "next/image";
import logoColor from "@/assets/brand/logo-color.png";
import { formatDate } from "@/lib/format";
import type { OfferLetter } from "@/lib/offerLetter";

/** The offer letter as a paper document, always light so it prints the same in either theme. */
export function OfferLetterSheet({ offer, email }: { offer: OfferLetter; email?: string }) {
  return (
    <article className="print-sheet mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-card sm:p-12">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <Image src={logoColor} alt={offer.company} className="h-10 w-auto" sizes="200px" />
        <div className="text-sm text-slate-600 sm:text-right">
          <p className="font-semibold text-slate-900">{offer.company}</p>
          <p className="max-w-xs whitespace-pre-line">{offer.companyAddress}</p>
        </div>
      </header>
      <div className="mt-6 flex flex-wrap justify-between gap-2 text-sm">
        <div>
          <p className="font-medium text-slate-900">{offer.candidateName}</p>
          {email && <p className="text-slate-600">{email}</p>}
        </div>
        <p className="text-slate-600">Date: {formatDate(offer.issuedOn)}</p>
      </div>
      <h1 className="mt-6 text-lg font-semibold text-slate-900">{offer.subject}</h1>
      <div className="mt-4 text-[15px] leading-7 whitespace-pre-line text-slate-800">{offer.body}</div>
      {offer.terms && (
        <section className="mt-6">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Terms</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {offer.terms.split("\n").filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </section>
      )}
      <footer className="mt-12 grid gap-10 sm:grid-cols-2">
        <div>
          <div className="h-12" />
          <p className="border-t border-slate-300 pt-2 text-sm font-medium text-slate-900">{offer.signatoryName || "Authorised signatory"}</p>
          <p className="text-sm text-slate-600">{offer.signatoryTitle}, {offer.company}</p>
        </div>
        <div>
          <div className="h-12" />
          <p className="border-t border-slate-300 pt-2 text-sm font-medium text-slate-900">Accepted: {offer.candidateName}</p>
          <p className="text-sm text-slate-600">Signature and date</p>
        </div>
      </footer>
    </article>
  );
}
