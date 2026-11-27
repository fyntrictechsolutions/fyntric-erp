"use client";

import { Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { readShared, type SharedCopy } from "@/lib/salesDocs";
import { DocumentSheet } from "./DocumentSheet";

/** The public view of a shared document: the paper version and a Save as PDF button. */
export function SharedDocument() {
  const token = useSearchParams().get("t");
  const [state, setState] = useState<{ token: string | null; copy: SharedCopy | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    readShared(token)
      .then((copy) => live && setState({ token, copy, failed: false }))
      .catch(() => live && setState({ token, copy: null, failed: true }));
    return () => {
      live = false;
    };
  }, [token]);

  const current = state && state.token === token ? state : null;
  if (token && !current) return <p className="py-24 text-center text-sm text-slate-500">Loading…</p>;
  if (!current?.copy)
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-lg font-semibold text-slate-900">This link isn&apos;t available</p>
        <p className="mt-2 text-sm text-slate-600">It may have been withdrawn or replaced. Please ask the sender for a new link.</p>
      </div>
    );

  const { copy } = current;
  return (
    <div className="min-h-dvh bg-slate-100 px-3 py-6 sm:px-6 sm:py-10 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-slate-600">From {copy.business.name}</p>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700">
          <Printer className="size-4" /> Save as PDF
        </button>
      </div>
      <DocumentSheet doc={copy.doc} business={copy.business} highlights={copy.highlights} />
    </div>
  );
}
