import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import TownExperience from "@/components/town-experience";
import { simulatorEnabled } from "@/lib/simulation/config";
import { getAuthService } from "@/lib/auth/server";
import { cookieNames } from "@/lib/auth/config";
import { isAuthError } from "@/lib/auth/types";
import { getTownPersistence } from "@/lib/persistence/server";
import { streamerAccess } from "@/lib/persistence/streamer-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Town Overview — Living Town" };
export default async function TownOverviewPage() {
  const enableSimulator = process.env.PUBLIC_DEPLOYMENT !== "true" && simulatorEnabled(process.env.NODE_ENV, process.env.TOWN_DEMO_MODE);
  const id = (await cookies()).get(cookieNames(process.env.NODE_ENV === "production").session)?.value;
  // Retain the existing explicitly authorized local demo without requiring credentials.
  if (enableSimulator && !id) return <TownExperience enableSimulator />;
  let access;
  let signIn = false;
  try { access = await streamerAccess(getAuthService(), getTownPersistence, id); }
  catch (error) { signIn = isAuthError(error) && ["unauthorized", "expired", "invalid_token"].includes(error.code); }
  if (signIn) redirect("/account");
  if (!access) return <main className="account-page"><h1>Your town is resting</h1><p role="alert">Your saved town could not be loaded. Please check your connection and retry.</p><a href="/town-overview">Try again</a> · <Link href="/account">Account</Link></main>;
  if (!access.town && !enableSimulator) return <main className="account-page"><h1>A town is waiting for you</h1><p>Create your own community town, or visit your homes through My Houses.</p><Link className="primary-button" href="/onboarding">Create My Town</Link> <Link className="account-button" href="/my-houses">My Houses</Link></main>;
  return <TownExperience enableSimulator={enableSimulator} initialTown={access.town} />;
}
