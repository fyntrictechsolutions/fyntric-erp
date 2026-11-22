import type { Metadata } from "next";
import { PayrollPage } from "@/components/hr/Payroll";

export const metadata: Metadata = { title: "Payroll" };

export default function Page() {
  return <PayrollPage />;
}
