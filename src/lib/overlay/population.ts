import { createHmac, randomBytes } from "node:crypto";
import { residentSources, type ResidentSource } from "../simulation/residents";
import type { TownWorld } from "../simulation/types";

export type OverlayPopulation = { epoch: string; actors: ResidentSource[] };

/** Server-only instance secret, independent of the browser-visible OBS grant.
 * Opaque IDs stay stable through refresh, but rotate on server process restart. */
export class OverlayPopulationProjector {
  private key = randomBytes(32);
  private epoch = randomBytes(16).toString("hex");
  project(world: TownWorld): OverlayPopulation {
    return { epoch: this.epoch, actors: residentSources(world).map(({ id, ...source }) => ({ ...source,
      id: createHmac("sha256", this.key).update(`${world.id}\0${id}`).digest("hex") })) };
  }
}
