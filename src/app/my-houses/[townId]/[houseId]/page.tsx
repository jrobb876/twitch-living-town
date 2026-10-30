import Link from "next/link";
import OwnedHouseEditor from "@/components/owned-house-editor";
import { townVisitPath } from "@/lib/houses/links";
export const metadata = { title: "Your cottage — Living Town" };
export default async function PropertyPage({ params }: { params: Promise<{ townId: string; houseId: string }> }) {
  const target = await params;
  return <main className="houses-page"><nav className="houses-nav"><Link href="/my-houses">← My Houses</Link><Link href="/dashboard">Dashboard</Link><Link href={townVisitPath(target.townId)}>Visit Town</Link></nav>
    <div className="eyebrow">LIVING TOWN · EXTERIOR STUDIO</div><h1>A home with your name on it<span>.</span></h1><p>A fresh coat of paint. A welcoming garden. A place that feels like you.</p><OwnedHouseEditor {...target} /></main>;
}
