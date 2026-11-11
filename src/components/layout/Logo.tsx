import Image from "next/image";
import logoColor from "@/assets/brand/logo-color.png";
import logoLight from "@/assets/brand/logo-light.png";
import { cn } from "@/lib/cn";

/** Full-colour logo in the light theme, white-text version in the dark theme. */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <Image src={logoColor} alt="Fyntric Tech" priority={priority} className="h-8 w-auto dark:hidden" sizes="180px" />
      <Image src={logoLight} alt="Fyntric Tech" priority={priority} className="hidden h-8 w-auto dark:block" sizes="180px" />
    </span>
  );
}
