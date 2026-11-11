import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

const ACCENTS = {
  blue: "from-brand-500 to-brand-700",
  cyan: "from-accent-cyan to-brand-500",
  violet: "from-accent-violet to-brand-600",
  amber: "from-amber-400 to-orange-500",
  green: "from-emerald-400 to-teal-600",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  accent = "blue",
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  href?: string;
  accent?: keyof typeof ACCENTS;
  loading?: boolean;
}) {
  const body = (
    <Card className="group relative h-full overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong">
      <div aria-hidden className={cn("pointer-events-none absolute -top-10 -right-10 size-28 rounded-full bg-gradient-to-br opacity-15 blur-2xl transition-opacity group-hover:opacity-30", ACCENTS[accent])} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-tint-strong" /> : value}
          </p>
          {hint && <p className="mt-1 truncate text-xs text-subtle">{hint}</p>}
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm", ACCENTS[accent])}>
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
    </Card>
  );
  return href ? <Link href={href} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-brand-500">{body}</Link> : body;
}
