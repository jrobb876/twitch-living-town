"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { TownWorld } from "@/lib/simulation/types";
import type { PropertyView } from "@/lib/houses/customization";
import { neighborhoodLabel } from "@/lib/simulation/population";
import TownPreview from "./town-preview";
import TownLoading from "./town-loading";
export default function SubscriberDemoTown() {
  const [data, setData] = useState<{ world: TownWorld; property: PropertyView } | null>(null), [error, setError] = useState("");
  const [focus, setFocus] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/demo/subscriber", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const value = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok || !value.world) throw new Error("unavailable"); setData(value);
    }).catch(() => { if (!controller.signal.aborted) setError("Open the Dashboard to activate or reset your subscriber demo."); });
    return () => controller.abort();
  }, []);
  if (error) return <p role="alert">{error} <Link href="/dashboard">Dashboard</Link></p>;
  if (!data) return <TownLoading message="Opening Maplebrook…" />;
  return <><p>MaplebrookLive (fictional) · {data.world.residents.length} simulated subscribers · {data.world.residents.filter((resident) => resident.houseId).length} subscriber homes · {neighborhoodLabel(data.world)}</p>
    <button className="account-button" onClick={() => setFocus((value) => value + 1)}>Find My House</button>
    <TownPreview world={data.world} focusRequest={focus ? { houseId: data.property.house.id, sequence: focus } : undefined} />
  </>;
}
