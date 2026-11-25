import type { Metadata } from "next";
import { ProjectDetailPage } from "@/components/projects/ProjectDetail";

export const metadata: Metadata = { title: "Project" };

export default function Page() {
  return <ProjectDetailPage />;
}
