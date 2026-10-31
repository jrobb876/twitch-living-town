import Link from "next/link";
import { notFound } from "next/navigation";
import { getTownPersistence } from "@/lib/persistence/server";
import { isPersistenceError } from "@/lib/persistence/types";
import { publicVisitWorld } from "@/lib/persistence/public-view";
import { townVisitPath } from "@/lib/houses/links";
import TownPreview from "@/components/town-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Visit a town — Living Town" };
export default async function VisitTownPage({ params }: { params: Promise<{ townId: string }> }) {
  const { townId } = await params;
  let view;
  try { view = await getTownPersistence().publicTown(townId); }
  catch (error) {
    if (isPersistenceError(error) && ["not_found", "invalid_input"].includes(error.code)) notFound();
  }
  if (!view) return <main className="account-page"><h1>This town is resting</h1><p role="alert">The saved town could not be loaded right now.</p><a href={townVisitPath(townId)}>Retry</a> · <Link href="/dashboard">Dashboard</Link></main>;
  return <main className="streamer-page town-visit"><nav className="houses-nav" aria-label="Breadcrumb"><Link href="/my-houses">My Houses</Link><span aria-current="page">{view.name}</span></nav>
    <div className="eyebrow">A LITTLE VISIT</div><h1>{view.name}</h1><p>Mayor {view.mayor.name} welcomes you. Explore with the zoom and pan controls.</p>
    <TownPreview key={view.id} world={publicVisitWorld(view)} />
    <p className="workspace-help">Read-only view of the saved town. Refresh to see new homes and customizations. Live chat activity and private resident details are not included.</p>
  </main>;
}
