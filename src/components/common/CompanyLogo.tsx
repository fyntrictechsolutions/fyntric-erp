"use client";

import Image from "next/image";
import logoColor from "@/assets/brand/logo-color.png";
import { useSettings } from "@/components/settings/SettingsProvider";
import { cn } from "@/lib/cn";

/** The logo printed on documents: the one uploaded in Settings → Business, or the Fyntric logo until then. */
export function CompanyLogo({ className }: { className?: string }) {
  const { business } = useSettings();
  if (business.logo)
    // eslint-disable-next-line @next/next/no-img-element -- a small data URL from settings
    return <img src={business.logo} alt={business.name} className={cn("h-10 w-auto max-w-[220px] object-contain object-left", className)} />;
  return <Image src={logoColor} alt={business.name} className={cn("h-10 w-auto", className)} sizes="200px" />;
}
