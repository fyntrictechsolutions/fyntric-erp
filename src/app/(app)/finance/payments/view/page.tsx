import type { Metadata } from "next";
import { PaymentDetailPage } from "@/components/finance/PaymentDetail";

export const metadata: Metadata = { title: "Payment receipt" };

export default function Page() {
  return <PaymentDetailPage />;
}
