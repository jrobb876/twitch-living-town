import type { StoredTown } from "./types";

export type TownLoadState = { town: StoredTown | null; error?: string; message?: string };
/** The Overview's read-only refresh path, shared by automatic loads and contextual retries. */
export function createTownLoader(onState: (state: TownLoadState) => void, onTown: (town: StoredTown | null) => void,
  onPending: (pending: boolean) => void, initialTown: StoredTown | null = null, request: typeof fetch = fetch) {
  let active: AbortController | null = null, lastTown = initialTown;
  return {
    async refresh() {
      active?.abort(); const controller = new AbortController(); active = controller;
      onPending(true);
      try {
        const response = await request("/api/town", { method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const data = await response.json() as TownLoadState;
        if (controller.signal.aborted) return;
        if (response.ok) {
          if (!data || !("town" in data)) throw new Error("Invalid town response");
          lastTown = data.town; onState({ town: lastTown }); onTown(lastTown);
        } else {
          if (response.status === 401) { lastTown = null; onTown(null); }
          onState({ town: lastTown, error: data?.error ?? "unavailable", message: data?.message ?? "Your saved town could not be loaded. Please retry." });
        }
      } catch {
        if (!controller.signal.aborted) onState({ town: lastTown, error: "unavailable", message: "Town storage could not be reached. Please retry." });
      } finally { if (!controller.signal.aborted) onPending(false); }
    },
    dispose() { active?.abort(); },
  };
}
