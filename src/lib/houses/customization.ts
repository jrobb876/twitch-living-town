import { z } from "zod";
import type { HouseBuilding, TownWorld } from "../simulation/types";
import type { House } from "../town/types";

export const colors = { rose: 0xc78679, sage: 0x73978a, honey: 0xd5b176, lavender: 0x9c8fab, cream: 0xf4dfbb, cedar: 0x9b765b } as const;
export const colorNames = { original: "Keep current", rose: "Rose clay", sage: "Garden sage", honey: "Warm honey", lavender: "Soft lavender", cream: "Vanilla cream", cedar: "Cedar wood" } as const;
const color = z.enum(["original", "rose", "sage", "honey", "lavender", "cream", "cedar"]);
export const exteriorSchema = z.object({
  houseName: z.string().trim().max(40).regex(/^[\p{L}\p{N} .'-]*$/u, "Use letters, numbers, spaces, apostrophes, periods or hyphens."),
  roof: color, wall: color, door: color, fence: color,
  garden: z.enum(["flowers", "herbs", "stones"]), accent: z.enum(["none", "lantern", "birdhouse"]),
}).strict();
export type ExteriorDraft = z.infer<typeof exteriorSchema>;
export type PropertyView = { townId: string; townName: string; revision: number; house: HouseBuilding; ownerName: string; editable: boolean };
const preset = (value: unknown): ExteriorDraft["roof"] => (Object.keys(colors) as (keyof typeof colors)[]).find((key) => colors[key] === value) ?? "original";
export function exteriorOf(house: HouseBuilding): ExteriorDraft {
  const data = house.property?.customization ?? {};
  const name = exteriorSchema.shape.houseName.safeParse(data.houseName ?? "");
  return { houseName: name.success ? name.data : "", roof: preset(house.appearance.roofColor), wall: preset(house.appearance.wallColor),
    door: preset(data.doorColor), fence: preset(data.fenceColor),
    garden: exteriorSchema.shape.garden.safeParse(data.garden).success ? data.garden as ExteriorDraft["garden"] : "flowers",
    accent: exteriorSchema.shape.accent.safeParse(data.accent).success ? data.accent as ExteriorDraft["accent"] : "none" };
}
/** Pure copy: drafts never mutate the saved house or unrelated metadata. */
export function customizeHouse(house: HouseBuilding, input: ExteriorDraft): HouseBuilding {
  const draft = exteriorSchema.parse(input), copy = structuredClone(house);
  if (draft.roof !== "original") copy.appearance.roofColor = colors[draft.roof];
  if (draft.wall !== "original") copy.appearance.wallColor = colors[draft.wall];
  copy.property ??= { size: "small", prestige: 0, status: "unclaimed", customization: {} };
  const data = copy.property.customization;
  data.houseName = draft.houseName; data.garden = draft.garden; data.accent = draft.accent;
  if (draft.door !== "original") data.doorColor = colors[draft.door];
  if (draft.fence !== "original") data.fenceColor = colors[draft.fence];
  return copy;
}
export function houseVisual(house: HouseBuilding): House {
  const data = house.property?.customization ?? {}, draft = exteriorOf(house);
  const safeColor = (value: unknown): value is number => typeof value === "number" && Object.values(colors).some((c) => c === value);
  const visual: House = { id: house.id, ...house.position, roof: house.appearance.roofColor, wall: house.appearance.wallColor,
    flowers: house.appearance.flowerColor, style: ["cottage", "simple", "dormer"].indexOf(house.appearance.architecture) };
  // Preserve the exact original projection/artwork for houses without customization.
  if (draft.houseName) visual.name = draft.houseName;
  if (safeColor(data.doorColor)) visual.door = data.doorColor;
  if (safeColor(data.fenceColor)) visual.fence = data.fenceColor;
  if (data.garden !== undefined) visual.garden = draft.garden;
  if (data.accent !== undefined) visual.accent = draft.accent;
  return visual;
}
export function canCustomize(world: TownWorld, house: HouseBuilding, userId: string) {
  const resident = world.residents.find((r) => r.twitchUserId === userId);
  return house.ownerTwitchUserId === userId && house.property?.status === "verified_subscriber"
    && resident?.houseId === house.id && resident.isSubscriber && resident.subscription?.active === true;
}
/** Local demo only: callers pass a demo world; no identity or entitlement is invented. */
export function customizeDemo(world: TownWorld, houseId: string, draft: ExteriorDraft): TownWorld {
  if (world.id !== "demo-house-editor" || world.buildings.some((b) => b.kind === "house" && b.ownerTwitchUserId)) throw new Error("Demo isolation required");
  return { ...world, buildings: world.buildings.map((b) => b.kind === "house" && b.id === houseId ? customizeHouse(b, draft) : b) };
}
