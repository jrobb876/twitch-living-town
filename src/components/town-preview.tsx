"use client";
import TownLoading from "./town-loading";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createSession, synchronizeWorld } from "@/lib/simulation/world";
import { tickTown } from "@/lib/simulation/engine";
import type { TownWorld } from "@/lib/simulation/types";
const TownCanvas = dynamic(() => import("./town-canvas"), { ssr: false, loading: () => <div className="canvas-message"><TownLoading compact /></div> });
export default function TownPreview({ world }: { world: TownWorld }) {
  const [session, setSession] = useState(() => createSession(world));
  const current = synchronizeWorld(session, world);
  if (current !== session) setSession(current);
  useEffect(() => {
    const timer = window.setInterval(() => setSession((state) => tickTown(state, state.runtime.now + 100)), 100);
    return () => clearInterval(timer);
  }, []);
  return <div className="village-frame workspace-preview"><div className="map-topline"><span className="map-badge">{world.name}</span></div><TownCanvas session={current} /></div>;
}
