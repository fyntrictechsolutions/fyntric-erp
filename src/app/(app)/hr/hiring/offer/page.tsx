import type { Metadata } from "next";
import { OfferLetterPage } from "@/components/hr/OfferLetterPage";

export const metadata: Metadata = { title: "Offer letter" };

export default function Page() {
  return <OfferLetterPage />;
}
