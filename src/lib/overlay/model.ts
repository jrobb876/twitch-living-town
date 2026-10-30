import { z } from "zod";
import { houseVisual } from "../houses/customization";
import type { TownWorld } from "../simulation/types";

export const displaySchema = z.object({ mode: z.enum(["living-town", "spotlight"]), side: z.enum(["left", "right"]),
  background: z.enum(["town", "transparent"]), scale: z.number().min(0.5).max(1.5) }).strict();
export type DisplaySettings = z.infer<typeof displaySchema>;
export const defaultDisplay: DisplaySettings = { mode: "living-town", side: "left", background: "town", scale: 1 };
export type OverlayActivity = { ready: boolean; status: string; receivedMessages: number; sampleAgesMs: number[] };
export const offlineActivity = (): OverlayActivity => ({ ready: false, status: "disconnected", receivedMessages: 0, sampleAgesMs: [] });

/** Only the existing renderer's visual inputs cross the capability boundary.
 * No Twitch resident identities, subscription evidence, receipts or private metadata. */
export function overlayWorld(world: TownWorld): TownWorld {
  return { schemaVersion: 1, generatorVersion: 1, id: world.id, streamerTwitchUserId: "overlay", name: world.name, seed: world.seed,
    layout: world.layout, districts: world.districts, plots: world.plots, mayor: world.mayor,
    buildings: world.buildings.map((b) => {
      if (b.kind === "town-hall") return { id: b.id, kind: b.kind, position: b.position };
      const visual = houseVisual(b);
      return { id: b.id, kind: b.kind, plotId: b.plotId, position: b.position, ownerTwitchUserId: null, appearance: b.appearance,
        property: { size: "small", prestige: 0, status: "unclaimed", customization: {
          ...(visual.name ? { houseName: visual.name } : {}), ...(visual.door ? { doorColor: visual.door } : {}),
          ...(visual.fence ? { fenceColor: visual.fence } : {}), ...(visual.garden ? { garden: visual.garden } : {}), ...(visual.accent ? { accent: visual.accent } : {}),
        } } };
    }), residents: [], processedEvents: [], giftGroups: [] };
}
export function spotlightComposition(width: number, height: number, settings: DisplaySettings) {
  return { visible: settings.mode === "spotlight", showTown: settings.mode === "living-town" || settings.background === "town",
    x: width * (settings.side === "left" ? 0.23 : 0.77), y: height * 0.84,
    scale: Math.min(height / 115, width / 240) * settings.scale };
}
