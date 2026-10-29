import Link from "next/link";
import { notFound } from "next/navigation";
import DemoHouseEditor from "@/components/demo-house-editor";
import { simulatorEnabled } from "@/lib/simulation/config";
export const metadata = { title: "Demo House Editor — Living Town" };
export default function DemoEditorPage() {
  if (!simulatorEnabled(process.env.NODE_ENV, process.env.TOWN_DEMO_MODE)) notFound();
  return <main className="houses-page"><nav className="houses-nav"><Link href="/my-houses">← My Houses</Link><Link href="/">Town Overview</Link></nav>
    <div className="eyebrow">LIVING TOWN · A LITTLE PRACTICE COTTAGE</div><h1>Make it feel like home<span>.</span></h1><DemoHouseEditor /></main>;
}
