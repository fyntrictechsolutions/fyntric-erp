"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile } from "@/components/auth/AuthProvider";
import { NAVIGATION } from "@/config/navigation";
import { canRead } from "@/config/roles";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const profile = useProfile();

  const sections = NAVIGATION.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.module || canRead(profile.role, i.module)),
  })).filter((s) => s.items.length);

  return (
    <nav className="flex h-full flex-col" aria-label="Main">
      <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2 px-5 py-5">
        <Logo priority />
      </Link>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {sections.map((section, idx) => (
          <div key={section.title ?? idx}>
            {section.title && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-subtle uppercase">{section.title}</p>}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                // Longest matching href wins, so /projects/timesheets doesn't also light up /projects.
                const matches = NAVIGATION.flatMap((s) => s.items).filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
                const best = matches.sort((a, b) => b.href.length - a.href.length)[0];
                const active = best?.href === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-tint-strong hover:text-foreground",
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
