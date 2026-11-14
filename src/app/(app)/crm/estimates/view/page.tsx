import type { Metadata } from "next";
import { EstimateDetailPage } from "@/components/crm/EstimateDetail";

export const metadata: Metadata = { title: "Estimate" };

export default function Page() {
  return <EstimateDetailPage />;
}
