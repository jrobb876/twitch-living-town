"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AccountProfile } from "@/lib/auth/types";
import { authMessages } from "@/lib/auth/messages";
import { logoutAccount } from "@/lib/auth/logout-client";

type AccountState = { user: AccountProfile | null; csrfToken: string | null; error?: string };

export default function TwitchAccount({ detailed = false, initialAccount }: { detailed?: boolean; initialAccount?: AccountState }) {
  const [account, setAccount] = useState<AccountState | null>(initialAccount ?? null);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  async function signOut() {
    if (signingOut || !account?.csrfToken) return;
    setSigningOut(true); setLogoutError(false);
    try {
      await logoutAccount(account.csrfToken);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full navigation clears cached authenticated UI after logout.
      window.location.assign("/account?auth=signed_out");
    } catch { setLogoutError(true); setSigningOut(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const data = await response.json() as AccountState;
        if (!controller.signal.aborted) setAccount(data);
      } catch {
        if (!controller.signal.aborted) setAccount({ user: null, csrfToken: null, error: "unavailable" });
      } finally { inFlight = false; }
    }
    void refresh();
    // UI freshness only. The independent server timer performs required validation.
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  if (!account) return <span className="account-loading" role="status">Checking account…</span>;
  const user = account.user;
  return <div className={detailed ? "account-profile" : "account-controls"}>
    {user ? <>
      <Link className="account-button" href="/dashboard">Dashboard</Link>
      <Link className="account-button" href="/dashboard/town">My Town</Link>
      <Link className="account-button" href="/my-houses">My Houses</Link>
      <div className="account-identity">
        {user.profileImageUrl && <Image unoptimized src={user.profileImageUrl} width={detailed ? 72 : 32} height={detailed ? 72 : 32} alt={`${user.displayName}'s Twitch profile`} referrerPolicy="no-referrer" className="account-avatar" />}
        {detailed ? <div><h1>{user.displayName}</h1><p>@{user.login}</p><p>Twitch user ID: <code>{user.twitchUserId}</code></p></div>
          : <Link href="/account">{user.displayName}</Link>}
      </div>
      {detailed && <p>Connected to Living Town. Town administration requires ownership of that specific town. This login does not verify an active subscription or assign a house.</p>}
      <button className="account-button" type="button" onClick={signOut} disabled={signingOut || !account.csrfToken}>
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
      {logoutError && <p className="account-error" role="alert">Sign-out could not be confirmed. Please retry.</p>}
    </> : <>
      <a className="account-button" href="/api/auth/twitch/login">Connect with Twitch</a>
      {detailed && <p>Streamers and viewers connect the same way. Living Town requests only your basic Twitch identity.</p>}
    </>}
    {account.error && <p className="account-error" role="status">{authMessages[account.error] ?? authMessages.unavailable}</p>}
  </div>;
}
