import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { subscriberDemoEnabled } from "@/lib/houses/subscriber-demo";
import { getAuthService } from "@/lib/auth/server";
import { cookieNames } from "@/lib/auth/config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function SubscriberDemoLayout({ children }: { children: React.ReactNode }) {
  if (!subscriberDemoEnabled()) notFound();
  if (!/^(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/.test((await headers()).get("host") ?? "")) notFound();
  const id = (await cookies()).get(cookieNames(false).session)?.value;
  let signedIn = false;
  try { signedIn = !!await getAuthService().getProfile(id); } catch { /* Fail closed. */ }
  if (!signedIn) redirect("/account");
  return children;
}
