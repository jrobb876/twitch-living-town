"use client";
import TownLoading from "./town-loading";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PropertyView } from "@/lib/houses/customization";
import HouseEditor from "./house-editor";
import PropertyTownMap from "./property-town-map";
import type { TownWorld } from "@/lib/simulation/types";
export default function OwnedHouseEditor({ townId, houseId, demo = false }: { townId: string; houseId: string; demo?: boolean }) {
  const [loaded, setLoaded] = useState<{ property: PropertyView; csrfToken: string; world?: TownWorld } | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const [focus, setFocus] = useState(0);
  const endpoint = demo ? "/api/demo/subscriber" : `/api/my-houses/${encodeURIComponent(townId)}/${encodeURIComponent(houseId)}`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok || !data.property) { setError(data.message ?? "This property could not be opened. For a demo property, activate the subscriber experience from the Dashboard first."); return; }
      setLoaded(data); setError("");
    }).catch(() => { if (!controller.signal.aborted) setError("This property could not be loaded. Please retry."); });
    return () => controller.abort();
  }, [endpoint, attempt]);
  const reload = () => { setLoaded(null); setError(""); setAttempt((i) => i + 1); };
  if (error) return <section className="house-empty"><p role="alert">{error}</p><Link className="account-button" href="/account">Your Twitch account</Link> <button className="account-button" onClick={reload}>Retry</button></section>;
  if (!loaded) return <TownLoading message="Opening your cottage…" />;
  return <><HouseEditor key={`editor:${endpoint}:${attempt}`} initial={loaded.property} demo={demo} onFind={() => setFocus((value) => value + 1)} onReload={reload} onSave={async (exterior, revision) => {
    const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": loaded.csrfToken }, body: JSON.stringify({ revision, exterior, ...(demo ? { houseId: loaded.property.house.id } : {}) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "The save could not be confirmed. Reload before retrying.");
    setLoaded(data); return data.property;
  }} /><PropertyTownMap key={`map:${endpoint}:${attempt}`} property={loaded.property} demoWorld={loaded.world} focus={focus} /></>;
}
