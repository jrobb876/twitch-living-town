import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthService } from "@/lib/auth/server";
import { cookieNames } from "@/lib/auth/config";
import { isAuthError } from "@/lib/auth/types";
import { dashboardAccess } from "@/lib/persistence/dashboard";
import { getTownPersistence } from "@/lib/persistence/server";
import AccountDashboard from "@/components/account-dashboard";
import { subscriberDemoEnabled } from "@/lib/houses/subscriber-demo";
export const metadata = { title: "Dashboard — Living Town" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  let data;
  let signIn = false;
  try {
    const jar = await cookies();
    data = await dashboardAccess(getAuthService(), getTownPersistence, jar.get(cookieNames(process.env.NODE_ENV === "production").session)?.value);
  } catch (error) {
    signIn = isAuthError(error) && error.code !== "unavailable";
  }
  if (signIn) redirect("/account");
  if (!data) return <main className="account-page"><h1>Your dashboard is resting</h1><p role="alert">Your account could not be verified right now. Please retry shortly.</p><a href="/dashboard">Retry dashboard</a> · <Link href="/account">Account details</Link></main>;
  return <AccountDashboard data={data} subscriberDemo={subscriberDemoEnabled()} />;
}
