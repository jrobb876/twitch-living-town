import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ObsScene from "@/components/obs-scene";
import { townIdSchema } from "@/lib/persistence/validation";
export const metadata: Metadata = { title: "Living Town · OBS", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function OverlayPage({ params }: { params: Promise<{ townId: string }> }) {
  const { townId } = await params;
  if (!townIdSchema.safeParse(townId).success) notFound();
  return <ObsScene townId={townId} />;
}
