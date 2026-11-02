"use client";
import { useEffect, useState } from "react";
import type { PropertyView } from "@/lib/houses/customization";
import type { TownWorld } from "@/lib/simulation/types";
import { publicVisitWorld } from "@/lib/persistence/public-view";
import TownPreview from "./town-preview";
import TownLoading from "./town-loading";

export default function PropertyTownMap({ property, demoWorld, focus }: { property: PropertyView; demoWorld?: TownWorld; focus: number }) {
  const [world, setWorld] = useState<TownWorld | null>(null), [error, setError] = useState("");
  useEffect(() => {
    if (demoWorld) return;
    const controller = new AbortController();
    void fetch(`/api/towns/${encodeURIComponent(property.townId)}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const value = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) throw new Error("unavailable");
      setWorld(publicVisitWorld(value.town));
    }).catch(() => { if (!controller.signal.aborted) setError("The town map could not be loaded. Reload the saved house to try again."); });
    return () => controller.abort();
  }, [property.townId, demoWorld]);
  const source = demoWorld ?? world;
  if (error) return <p role="alert">{error}</p>;
  if (!source) return <TownLoading message="Finding your town…" />;
  // Only update an existing mapped building; a missing assignment must remain missing.
  const view = { ...source, buildings: source.buildings.map((house) => house.id === property.house.id ? property.house : house) };
  return <section className="demo-town-section"><h2>Your home in {property.townName}</h2>
    <TownPreview world={view} focusRequest={focus ? { houseId: property.house.id, sequence: focus } : undefined} />
  </section>;
}
