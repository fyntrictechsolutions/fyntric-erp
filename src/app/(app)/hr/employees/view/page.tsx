import type { Metadata } from "next";
import { EmployeeDetailPage } from "@/components/hr/EmployeeDetail";

export const metadata: Metadata = { title: "Employee" };

export default function Page() {
  return <EmployeeDetailPage />;
}
