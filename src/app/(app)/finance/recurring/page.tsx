import type { Metadata } from "next";
import { ModulePage } from "@/components/resource/ModulePage";

export const metadata: Metadata = { title: "Recurring billing" };

export default function Page() {
  return <ModulePage module="recurring" />;
}
