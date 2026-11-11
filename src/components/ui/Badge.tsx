import { cn } from "@/lib/cn";

export type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-tint-strong text-muted",
  blue: "bg-brand-500/12 text-brand-700 dark:text-brand-300",
  green: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/12 text-red-700 dark:text-red-300",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}
