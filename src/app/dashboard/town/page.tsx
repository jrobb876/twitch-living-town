import StreamerPage from "@/components/streamer-page";
export const metadata = { title: "My Town settings — Living Town" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function MyTownPage() { return <StreamerPage destination="/dashboard/town" />; }
