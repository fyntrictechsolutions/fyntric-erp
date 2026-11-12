"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** Shown instead of a blank browser error page if something in the signed-in area breaks. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-500/10 text-red-600">
          <TriangleAlert className="size-6" />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm break-words text-muted">{error.message || "An unexpected error occurred."}</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={reset}><RotateCw className="size-4" /> Try again</Button>
        </div>
      </Card>
    </div>
  );
}
