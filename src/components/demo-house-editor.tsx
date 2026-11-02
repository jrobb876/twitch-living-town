"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { createWorld, housesIn, createSession } from "@/lib/simulation/world";
import { customizeDemo, type PropertyView } from "@/lib/houses/customization";
import HouseEditor from "./house-editor";
const TownCanvas = dynamic(() => import("./town-canvas"), { ssr: false });
export default function DemoHouseEditor() {
  const [world, setWorld] = useState(() => createWorld({ id: "demo-house-editor", streamerTwitchUserId: "sim-streamer", seed: 42, name: "Clover Demo Town", mayorName: "Mochi" }));
  const [initial] = useState<PropertyView>(() => ({ townId: world.id, townName: world.name, streamerTwitchUserId: world.streamerTwitchUserId, revision: 1, house: housesIn(world)[0], ownerName: "Demo neighbor (sample)", editable: true }));
  const [focus, setFocus] = useState(0);
  return <><p className="demo-editor-banner"><strong>DEMO HOUSE EDITOR</strong> · Isolated sample data. No verified subscriber, no real property owner, and no database writes. Reloading resets this demonstration.</p>
    <HouseEditor initial={initial} demo onFind={() => setFocus((value) => value + 1)} onSave={async (draft, revision) => {
      const next = customizeDemo(world, initial.house.id, draft); setWorld(next);
      return { ...initial, revision: revision + 1, house: housesIn(next).find((house) => house.id === initial.house.id)! };
    }} />
    <section className="demo-town-section"><div className="eyebrow">DEMO TOWN · APPLIED CHANGES ONLY</div><h2>A little place to call home</h2><p>The editor changes the first cottage in the upper-left residential block. Pan and zoom to see it in the village.</p>
      <div className="demo-town-canvas"><TownCanvas session={createSession(world)} focusRequest={focus ? { houseId: initial.house.id, sequence: focus } : undefined} /></div>
    </section>
  </>;
}
