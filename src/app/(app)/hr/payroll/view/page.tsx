import type { Metadata } from "next";
import { PayslipPage } from "@/components/hr/PayslipView";

export const metadata: Metadata = { title: "Payslip" };

export default function Page() {
  return <PayslipPage />;
}
