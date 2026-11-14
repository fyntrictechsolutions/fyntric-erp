import type { Metadata } from "next";
import { EmployeesToday } from "@/components/hr/EmployeesToday";
import { ModulePage } from "@/components/resource/ModulePage";

export const metadata: Metadata = { title: "Employees" };

export default function Page() {
  return <ModulePage module="employees" intro={<EmployeesToday />} />;
}
