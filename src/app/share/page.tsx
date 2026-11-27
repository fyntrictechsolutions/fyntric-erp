import type { Metadata } from "next";
import { Suspense } from "react";
import { SharedDocument } from "@/components/documents/SharedDocument";

export const metadata: Metadata = { title: "Document", robots: { index: false, follow: false } };

/** A document shared with a lead or client by link. No sign-in needed. */
export default function Page() {
  return (
    <Suspense>
      <SharedDocument />
    </Suspense>
  );
}
