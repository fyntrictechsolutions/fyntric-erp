"use client";

import { Printer } from "lucide-react";
import { useProfile } from "@/components/auth/AuthProvider";
import { BackLink, Loading, NotFound, WithRecordId } from "@/components/common/DetailShell";
import { NoAccess } from "@/components/resource/ModulePage";
import { Button } from "@/components/ui/Button";
import { canRead } from "@/config/roles";
import { useRecord } from "@/hooks/useCollection";
import type { OfferLetter } from "@/lib/offerLetter";
import { OfferLetterSheet } from "./OfferLetterSheet";

export function OfferLetterPage() {
  const profile = useProfile();
  if (!canRead(profile.role, "candidates")) return <NoAccess />;
  return <WithRecordId>{(id) => <OfferView id={id} />}</WithRecordId>;
}

function OfferView({ id }: { id: string }) {
  const { data: c, loading } = useRecord("candidates", id);
  if (loading) return <Loading />;
  const offer = c?.offerLetter as OfferLetter | undefined;
  if (!c || !offer) return <NotFound what="offer letter" />;
  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <BackLink href={`/hr/hiring/view?id=${id}`} label={String(c.fullName ?? "Candidate")} />
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / PDF
        </Button>
      </div>
      <OfferLetterSheet offer={offer} email={typeof c.email === "string" ? c.email : undefined} />
    </div>
  );
}
