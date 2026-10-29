"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PropertyView } from "@/lib/houses/customization";
import { exteriorOf } from "@/lib/houses/customization";
export default function MyHouses() {
  const [houses, setHouses] = useState<PropertyView[] | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/my-houses", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) { setError(data.message ?? "Your houses could not be loaded."); return; }
      setHouses(data.houses); setError("");
    }).catch(() => { if (!controller.signal.aborted) setError("Your houses could not be loaded. Please retry."); });
    return () => controller.abort();
  }, [attempt]);
  if (error) return <section className="house-empty"><h2>Your homes are safe</h2><p role="alert">{error}</p><Link className="account-button" href="/account">Your Twitch account</Link> <button className="account-button" onClick={() => { setError(""); setAttempt((i) => i + 1); }}>Retry</button></section>;
  if (!houses) return <p role="status">Finding your little corners of the world…</p>;
  if (!houses.length) return <section className="house-empty"><span aria-hidden="true">⌂</span><h2>A home is waiting in your community</h2><p>No subscriber properties are linked to this Twitch account yet. Once your streamer syncs verified subscribers, your home will appear here. Signing in doesn’t create a house.</p><Link href="/">Visit the Town Overview →</Link></section>;
  return <div className="house-grid">{houses.map((p) => <Link className="house-card" key={`${p.townId}:${p.house.id}`} href={`/my-houses/${p.townId}/${encodeURIComponent(p.house.id)}`}>
    <span className="house-card-icon" aria-hidden="true" style={{ color: `#${p.house.appearance.roofColor.toString(16).padStart(6, "0")}` }}>⌂</span>
    <span className="eyebrow">{p.editable ? "ACTIVE PROPERTY" : "READ-ONLY PROPERTY"}</span><h2>{exteriorOf(p.house).houseName || "Your cozy cottage"}</h2>
    <p>{p.townName}</p><p>Home of {p.ownerName}</p><strong>{p.editable ? "Customize your home" : "View your retained home"} →</strong>
  </Link>)}</div>;
}
