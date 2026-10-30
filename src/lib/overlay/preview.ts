import { createSession, createWorld, housesIn } from "../simulation/world";
import { processEvent } from "../simulation/engine";
import { seededRandom } from "../town/generate";
import { colors, customizeHouse } from "../houses/customization";

export const previewCounts = [25, 50, 100, 200] as const;
export const PREVIEW_ID = "demo-obs-preview";
export const PREVIEW_RESET_PATH = "/";
export function previewEnabled(env: Record<string, string | undefined>, host: string | null) {
  return env.NODE_ENV === "development" && env.TOWN_DEMO_MODE === "true" && env.PUBLIC_DEPLOYMENT !== "true"
    && /^(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/.test(host ?? "");
}
export function previewInput(count: number, seed: number) {
  if (!previewCounts.some((n) => n === count) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Invalid preview count or seed");
  return { count, seed };
}

/** Fresh synthetic world only. No saved-world input, repositories or network adapters. */
export function createExpandedPreview(count: number, seed: number) {
  previewInput(count, seed);
  let session = createSession(createWorld({ id: PREVIEW_ID, streamerTwitchUserId: "demo-only", seed,
    name: "Willowbrook · Simulated community", mayorName: "Mochi" }));
  const first = ["Hazel", "Clover", "Poppy", "Fern", "Maple", "Juniper", "Wren", "Moss", "Pip", "Basil", "Sunny", "Willow", "Ivy", "Rowan", "Luna", "Sage"];
  const last = ["Meadow", "Bramble", "Thistle", "Brook", "Acorn", "Petal", "Hollow", "Birch", "Dew", "Grove", "Bloom", "Cedar", "Vale"];
  for (let i = 0; i < count; i++) {
    session = processEvent(session, { id: `preview-sub-${i}`, type: "NEW_SUBSCRIBER", townId: PREVIEW_ID, occurredAt: 0,
      user: { twitchUserId: `fictional-${i}`, displayName: `${first[i % first.length]} ${last[Math.floor(i / first.length)]}` } }, 0).state;
  }
  const random = seededRandom(seed ^ 0x12abcd), palette = Object.keys(colors) as (keyof typeof colors)[];
  session.world.buildings = session.world.buildings.map((house) => {
    if (house.kind !== "house") return house;
    const owner = session.world.residents.find((r) => r.houseId === house.id)!;
    return customizeHouse(house, { houseName: `${owner.displayName}'s Cottage`, roof: palette[Math.floor(random() * palette.length)],
      wall: palette[Math.floor(random() * palette.length)], door: palette[Math.floor(random() * palette.length)],
      fence: palette[Math.floor(random() * palette.length)], garden: (["flowers", "herbs", "stones"] as const)[Math.floor(random() * 3)],
      accent: (["none", "lantern", "birdhouse"] as const)[Math.floor(random() * 3)] });
  });
  if (housesIn(session.world).length !== count) throw new Error("Preview allocation incomplete");
  // Do not replay hundreds of construction celebrations on first frame.
  session.world.processedEvents = [];
  return session.world;
}
