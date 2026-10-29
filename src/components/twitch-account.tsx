"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AccountProfile } from "@/lib/auth/types";
import { authMessages } from "@/lib/auth/messages";

type AccountState = { user: AccountProfile | null; csrfToken: string | null; error?: string };

export default function TwitchAccount({ detailed = false }: { detailed?: boolean }) {
  const [account, setAccount] = useState<AccountState | null>(null);
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
      <Link className="account-button" href="/my-houses">My Houses</Link>
      <div className="account-identity">
        {user.profileImageUrl && <Image unoptimized src={user.profileImageUrl} width={detailed ? 72 : 32} height={detailed ? 72 : 32} alt={`${user.displayName}'s Twitch profile`} referrerPolicy="no-referrer" className="account-avatar" />}
        {detailed ? <div><h1>{user.displayName}</h1><p>@{user.login}</p><p>Twitch user ID: <code>{user.twitchUserId}</code></p></div>
          : <Link href="/account">{user.displayName}</Link>}
      </div>
      {detailed && <p>Connected to Living Town. Town administration requires ownership of that specific town. This login does not verify an active subscription or assign a house.</p>}
      <form method="post" action="/api/auth/logout">
        <input type="hidden" name="csrfToken" value={account.csrfToken ?? ""} />
        <button className="account-button" type="submit">Sign out</button>
      </form>
    </> : <>
      <a className="account-button" href="/api/auth/twitch/login">Connect with Twitch</a>
      {detailed && <p>Streamers and viewers connect the same way. Living Town requests only your basic Twitch identity.</p>}
    </>}
    {account.error && <p className="account-error" role="status">{authMessages[account.error] ?? authMessages.unavailable}</p>}
  </div>;
}
