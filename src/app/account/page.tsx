import Link from "next/link";
import TwitchAccount from "@/components/twitch-account";
import { authMessages } from "@/lib/auth/messages";

export const metadata = { title: "Your Twitch account — Living Town" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const { auth } = await searchParams;
  const message = typeof auth === "string" && Object.hasOwn(authMessages, auth) ? authMessages[auth] : null;
  return <main className="account-page">
    <Link href="/">← Back to the Town Overview</Link>
    <div className="eyebrow">LIVING TOWN · TWITCH ACCOUNT</div>
    {message && <p className="account-notice" role="status">{message}</p>}
    <TwitchAccount detailed />
  </main>;
}
