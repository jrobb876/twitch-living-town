import "server-only";
import { getTownRpc, getTownPersistence } from "../persistence/server";
import { getChatManager } from "../chat/server";
import { getSubscriberHousing } from "../subscribers/server";
import { OverlayService } from "./service";
import { offlineActivity } from "./model";
import { reactionFromEffect } from "./reactions";

let service: OverlayService | undefined;
export function getOverlayService() {
  service ??= new OverlayService(getTownRpc(), getTownPersistence(), (owner) => {
    try { return getChatManager().overlayActivity(owner); } catch { return offlineActivity(); }
  }, (owner, townId) => {
    try { return getSubscriberHousing().overlayPresentations(owner, townId).flatMap((p) => p.effects.flatMap((effect, index) => {
      const reaction = reactionFromEffect(effect, `${p.id}:${index}`, p.expiresAt); return reaction ? [reaction] : [];
    })); } catch { return []; }
  });
  return service;
}
