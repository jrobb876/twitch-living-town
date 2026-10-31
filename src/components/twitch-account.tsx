"use client";

import Image from "next/image";
import TownLoading from "./town-loading";
import Link from "next/link";
import { useState } from "react";
import { useAccount, type AccountState } from "./account-context";
import { authMessages } from "@/lib/auth/messages";
import { signOutToHome } from "@/lib/auth/logout-client";

export default function TwitchAccount({ detailed = false, compact = false, initialAccount }: { detailed?: boolean; compact?: boolean; initialAccount?: AccountState }) {
  const account = useAccount(initialAccount);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  async function signOut() {
    if (signingOut || !account?.csrfToken) return;
    setSigningOut(true); setLogoutError(false);
    try {
      await signOutToHome(account.csrfToken, (path) => window.location.assign(path));
    } catch { setLogoutError(true); setSigningOut(false); }
  }
  if (!account && detailed) return <TownLoading message="Checking your Twitch connection…" />;
  if (!account) return <span className="account-loading" role="status">Checking account…</span>;
  const user = account.user;
  return <div className={detailed ? "account-profile" : "account-controls"}>
    {user ? <>

      {!compact && <div className="account-identity">
        {user.profileImageUrl && <Image unoptimized src={user.profileImageUrl} width={detailed ? 72 : 32} height={detailed ? 72 : 32} alt={`${user.displayName}'s Twitch profile`} referrerPolicy="no-referrer" className="account-avatar" />}
        {detailed ? <div><h1>{user.displayName}</h1><p>@{user.login}</p><p>Twitch user ID: <code>{user.twitchUserId}</code></p></div>
          : <Link href="/account">{user.displayName}</Link>}
      </div>}
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
