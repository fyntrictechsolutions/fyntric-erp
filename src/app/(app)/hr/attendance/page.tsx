import type { Metadata } from "next";
import { CheckInCard } from "@/components/hr/CheckInCard";
import { ModulePage } from "@/components/resource/ModulePage";

export const metadata: Metadata = { title: "Attendance" };

export default function Page() {
  return <ModulePage module="attendance" intro={<CheckInCard />} />;
}
