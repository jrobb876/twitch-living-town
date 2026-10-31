import { createWorld } from "./world";
/** A fixed, fictional visual sample. No account, event ingestion, API or storage access. */
export function publicSampleTown() {
  return createWorld({ id: "public-meadow-sample", streamerTwitchUserId: "sample-only", seed: 42, name: "Meadowbrook", mayorName: "Mochi" });
}
