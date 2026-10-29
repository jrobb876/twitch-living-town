"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createSession } from "@/lib/simulation/world";
import { tickTown } from "@/lib/simulation/engine";
import type { TownWorld } from "@/lib/simulation/types";
const TownCanvas = dynamic(() => import("./town-canvas"), { ssr: false, loading: () => <p className="canvas-message">Opening the village gates…</p> });
export default function TownPreview({ world }: { world: TownWorld }) {
  const [runtime, setRuntime] = useState(() => createSession(world).runtime);
  useEffect(() => {
    const timer = window.setInterval(() => setRuntime((current) => tickTown({ world, runtime: current }, current.now + 100).runtime), 100);
    return () => clearInterval(timer);
  }, [world]);
  return <div className="village-frame workspace-preview"><div className="map-topline"><span className="map-badge">{world.name}</span></div><TownCanvas session={{ world, runtime }} /></div>;
}
