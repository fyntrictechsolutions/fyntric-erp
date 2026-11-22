import type { Metadata } from "next";
import { HelpPage } from "@/components/help/HelpPage";

export const metadata: Metadata = { title: "Help & support" };

export default function Page() {
  return <HelpPage />;
}
