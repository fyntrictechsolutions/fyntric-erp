import type { Metadata } from "next";
import { ClientDetailPage } from "@/components/crm/ClientDetail";

export const metadata: Metadata = { title: "Client" };

export default function Page() {
  return <ClientDetailPage />;
}
