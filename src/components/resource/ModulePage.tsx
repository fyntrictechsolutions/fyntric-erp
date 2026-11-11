"use client";

import { Lock } from "lucide-react";
import { useProfile } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getModule } from "@/config/modules";
import { canRead, type ModuleKey } from "@/config/roles";
import { ResourcePage } from "./ResourcePage";

/** Route entry for a module: checks the role can open it, then shows its list screen. */
export function ModulePage({ module, intro }: { module: ModuleKey; intro?: React.ReactNode }) {
  const profile = useProfile();
  if (!canRead(profile.role, module)) return <NoAccess />;
  return <ResourcePage module={getModule(module)} intro={intro} />;
}

export function NoAccess() {
  return (
    <Card>
      <EmptyState icon={Lock} title="You don't have access to this page" description="Ask an admin if you need it for your work." />
    </Card>
  );
}
