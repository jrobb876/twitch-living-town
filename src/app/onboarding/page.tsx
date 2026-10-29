import StreamerPage from "@/components/streamer-page";
export const metadata = { title: "Welcome home — Living Town" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function OnboardingPage() { return <StreamerPage destination="/onboarding" />; }
