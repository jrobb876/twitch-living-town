import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthService } from "@/lib/auth/server";
import { cookieNames } from "@/lib/auth/config";
import { isAuthError } from "@/lib/auth/types";
import { getTownPersistence } from "@/lib/persistence/server";
import { streamerAccess } from "@/lib/persistence/streamer-access";
import { isPersistenceError, persistenceMessages } from "@/lib/persistence/types";
import StreamerWorkspace from "./streamer-workspace";

export default async function StreamerPage({ destination }: { destination: "/dashboard/town" | "/onboarding" }) {
  let access: Awaited<ReturnType<typeof streamerAccess>> | undefined;
  let message = "Your town could not be loaded. Please retry shortly.";
  let signIn = false;
  try {
    const jar = await cookies();
    access = await streamerAccess(getAuthService(), getTownPersistence, jar.get(cookieNames(process.env.NODE_ENV === "production").session)?.value);
  } catch (error) {
    signIn = isAuthError(error);
    if (isPersistenceError(error)) message = persistenceMessages[error.code];
  }
  if (signIn) redirect("/account");
  if (!access) return <main className="account-page"><h1>Your town is resting</h1><p role="alert">{message}</p><Link href={destination}>Try again</Link> · <Link href="/town-overview">Town Overview</Link></main>;
  if (access.destination !== destination) redirect(access.destination);
  return <StreamerWorkspace initialTown={access.town} csrfToken={access.csrfToken} />;
}
