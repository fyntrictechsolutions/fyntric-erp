import type { Metadata } from "next";
import { InvoiceDetailPage } from "@/components/finance/InvoiceDetail";

export const metadata: Metadata = { title: "Invoice" };

export default function Page() {
  return <InvoiceDetailPage />;
}
