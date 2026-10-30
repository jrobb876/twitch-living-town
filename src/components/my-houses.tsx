"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PropertyView } from "@/lib/houses/customization";
import PropertyCards from "./property-cards";
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
  return <PropertyCards houses={houses} />;
}
