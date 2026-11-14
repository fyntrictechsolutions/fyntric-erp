import type { Metadata } from "next";
import { LeadDetailPage } from "@/components/crm/LeadDetail";

export const metadata: Metadata = { title: "Lead" };

export default function Page() {
  return <LeadDetailPage />;
}
