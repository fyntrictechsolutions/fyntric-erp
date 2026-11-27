import type { Metadata } from "next";
import { DocumentViewPage } from "@/components/documents/DocumentView";

export const metadata: Metadata = { title: "Document" };

export default function Page() {
  return <DocumentViewPage />;
}
