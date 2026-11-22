import type { Metadata } from "next";
import { ResignPage } from "@/components/hr/ResignPage";

export const metadata: Metadata = { title: "Leaving the company" };

export default function Page() {
  return <ResignPage />;
}
