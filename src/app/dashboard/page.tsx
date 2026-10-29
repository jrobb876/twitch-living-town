import StreamerPage from "@/components/streamer-page";
export const metadata = { title: "Streamer Dashboard — Living Town" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function DashboardPage() { return <StreamerPage destination="/dashboard" />; }
