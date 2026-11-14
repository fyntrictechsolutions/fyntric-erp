import type { Metadata } from "next";
import { CandidateDetailPage } from "@/components/hr/CandidateDetail";

export const metadata: Metadata = { title: "Candidate" };

export default function Page() {
  return <CandidateDetailPage />;
}
