import Link from "next/link";
import SubscriberDemoTown from "@/components/subscriber-demo-town";
export default function DemoSubscriberTownPage() {
  return <main className="streamer-page town-visit"><nav className="houses-nav"><Link href="/my-houses">← My Houses</Link><Link href="/demo/subscriber/house">Open My House</Link><Link href="/dashboard">Dashboard</Link></nav>
    <div className="eyebrow">Development Demo — Simulated Subscription</div><h1>Welcome to Maplebrook</h1>
    <p>Mayor Maple welcomes you. Explore as a subscriber with the normal zoom and pan controls.</p><SubscriberDemoTown />
  </main>;
}
