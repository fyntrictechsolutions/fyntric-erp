import type { Metadata } from "next";
import { Suspense } from "react";
import { Gallery } from "@/components/gallery/Gallery";

export const metadata: Metadata = { title: "Gallery" };

export default function Page() {
  return (
    <Suspense>
      <Gallery gallery="sales" module="salesGallery" title="Gallery" description="Photos, brochures, videos and recordings for your products and services." />
    </Suspense>
  );
}
