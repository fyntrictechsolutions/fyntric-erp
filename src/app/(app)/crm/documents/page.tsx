import type { Metadata } from "next";
import { DocumentsLibrary } from "@/components/documents/DocumentsLibrary";

export const metadata: Metadata = { title: "Documents" };

export default function Page() {
  return <DocumentsLibrary />;
}
