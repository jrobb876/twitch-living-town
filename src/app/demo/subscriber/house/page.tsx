import Link from "next/link";
import OwnedHouseEditor from "@/components/owned-house-editor";
export default function DemoSubscriberHousePage() {
  return <main className="houses-page"><nav className="houses-nav"><Link href="/my-houses">← My Houses</Link><Link href="/demo/subscriber/town">View Town</Link><Link href="/dashboard">Dashboard</Link></nav>
    <div className="eyebrow">Development Demo — Simulated Subscription</div><h1>My Home in Maplebrook</h1>
    <p>MaplebrookLive is fictional. Only your assigned demo property can be edited. Saves stay in this login’s local server memory.</p>
    <OwnedHouseEditor townId="demo-maplebrook" houseId="viewer" demo />
  </main>;
}
