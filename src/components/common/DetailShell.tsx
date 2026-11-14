"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";

/** Reads ?id= from the URL (static pages can't have dynamic segments) and renders the detail view. */
export function WithRecordId({ children }: { children: (id: string) => React.ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <IdReader>{children}</IdReader>
    </Suspense>
  );
}

function IdReader({ children }: { children: (id: string) => React.ReactNode }) {
  const id = useSearchParams().get("id");
  if (!id) return <NotFound />;
  return <>{children(id)}</>;
}

export function Loading() {
  return (
    <div className="grid place-items-center py-24">
      <Spinner />
    </div>
  );
}

export function NotFound({ what = "record" }: { what?: string }) {
  return (
    <Card>
      <EmptyState title={`This ${what} doesn't exist`} description="It may have been deleted, or you don't have access to it." />
    </Card>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
      <ArrowLeft className="size-4" /> {label}
    </Link>
  );
}

/** Label / value grid used on detail pages. */
export function DetailGrid({ items }: { items: { label: string; value: React.ReactNode; wide?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className={it.wide ? "sm:col-span-2 lg:col-span-3" : undefined}>
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">{it.label}</dt>
          <dd className="mt-1 text-sm text-foreground">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
