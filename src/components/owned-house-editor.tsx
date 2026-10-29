"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PropertyView } from "@/lib/houses/customization";
import HouseEditor from "./house-editor";
export default function OwnedHouseEditor({ townId, houseId }: { townId: string; houseId: string }) {
  const [loaded, setLoaded] = useState<{ property: PropertyView; csrfToken: string } | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const endpoint = `/api/my-houses/${encodeURIComponent(townId)}/${encodeURIComponent(houseId)}`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) { setError(data.message ?? "This property could not be opened."); return; }
      setLoaded(data); setError("");
    }).catch(() => { if (!controller.signal.aborted) setError("This property could not be loaded. Please retry."); });
    return () => controller.abort();
  }, [endpoint, attempt]);
  const reload = () => { setLoaded(null); setError(""); setAttempt((i) => i + 1); };
  if (error) return <section className="house-empty"><p role="alert">{error}</p><Link className="account-button" href="/account">Your Twitch account</Link> <button className="account-button" onClick={reload}>Retry</button></section>;
  if (!loaded) return <p role="status">Opening your garden gate…</p>;
  return <HouseEditor key={`${endpoint}:${attempt}`} initial={loaded.property} onReload={reload} onSave={async (exterior, revision) => {
    const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": loaded.csrfToken }, body: JSON.stringify({ revision, exterior }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "The save could not be confirmed. Reload before retrying.");
    return data.property;
  }} />;
}
