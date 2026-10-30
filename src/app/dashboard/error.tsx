"use client";
import Link from "next/link";
export default function DashboardError({ reset }: { reset: () => void }) {
  return <main className="account-page"><h1>Your dashboard could not open</h1><p role="alert">Your saved town and houses are unchanged.</p><button className="account-button" onClick={reset}>Try again</button> <Link href="/account">Account details</Link></main>;
}
