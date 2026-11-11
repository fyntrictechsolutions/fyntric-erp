import type { Metadata } from "next";
import { ModulePage } from "@/components/resource/ModulePage";

export const metadata: Metadata = { title: "Invoices" };

export default function Page() {
  return <ModulePage module="invoices" />;
}
