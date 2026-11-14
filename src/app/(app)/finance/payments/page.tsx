import type { Metadata } from "next";
import { ModulePage } from "@/components/resource/ModulePage";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return <ModulePage module="payments" />;
}
