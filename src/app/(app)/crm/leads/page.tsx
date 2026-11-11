import type { Metadata } from "next";
import { ModulePage } from "@/components/resource/ModulePage";

export const metadata: Metadata = { title: "Leads" };

export default function Page() {
  return <ModulePage module="leads" />;
}
