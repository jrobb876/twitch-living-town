"use client";
import Link from "next/link";
import { useAccount } from "./account-context";
export default function HomeAction() {
  const account = useAccount();
  if (!account) return <span className="account-button" role="status">Checking your connection…</span>;
  return account.user ? <Link className="primary-button" href="/dashboard">Go to Dashboard</Link> : <a className="primary-button" href="/api/auth/twitch/login">Connect with Twitch</a>;
}
