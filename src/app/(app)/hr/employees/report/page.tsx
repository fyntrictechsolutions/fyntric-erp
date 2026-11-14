import type { Metadata } from "next";
import { MonthlyReportPage } from "@/components/hr/MonthlyReport";

export const metadata: Metadata = { title: "Attendance report" };

export default function Page() {
  return <MonthlyReportPage />;
}
