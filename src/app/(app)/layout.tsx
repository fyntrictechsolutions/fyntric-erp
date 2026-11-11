import { AuthGate } from "@/components/auth/AuthGate";

/** Everything inside (app) needs a signed-in user with a role. */
export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
