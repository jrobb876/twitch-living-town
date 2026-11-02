import Link from "next/link";
import MyHouses from "@/components/my-houses";
import SubscriberDemoEntry from "@/components/subscriber-demo-entry";
import { subscriberDemoEnabled } from "@/lib/houses/subscriber-demo";

import { simulatorEnabled } from "@/lib/simulation/config";
export const metadata = { title: "My Houses — Living Town" };
export default function MyHousesPage() {
  return <main className="houses-page">
    <div className="eyebrow">LIVING TOWN · YOUR COMMUNITY HOMES</div><h1>My houses<span>.</span></h1><p>Every community, a little place to belong. Find your homes and give each one a touch of you.</p>
    <MyHouses />{subscriberDemoEnabled() && <SubscriberDemoEntry />}{simulatorEnabled(process.env.NODE_ENV, process.env.TOWN_DEMO_MODE) && <aside className="demo-editor-invite"><h2>Try a little makeover</h2><p>No subscribers yet? Explore the same editor with a separate sample cottage.</p><Link className="account-button" href="/demo/house-editor">Open DEMO HOUSE EDITOR →</Link></aside>}
  </main>;
}
