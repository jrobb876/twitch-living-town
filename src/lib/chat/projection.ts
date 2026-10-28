import { calculateActivity } from "../simulation/activity";
import type { TownSession, TownWorld } from "../simulation/types";
import { createSession, createWorld } from "../simulation/world";
import type { ChatSnapshot } from "./types";

export function createLiveView(snapshot: ChatSnapshot, seed: number, name: string, mayorName: string, now: number, savedWorld?: TownWorld) {
  const state = createSession(savedWorld ?? createWorld({ id: snapshot.townId, streamerTwitchUserId: snapshot.channel.twitchUserId, seed, name, mayorName }), now);
  // Reuse existing ambient actor graphics/behavior; these are scenery, not Twitch resident records.
  if (!state.runtime.residentActors.length) state.runtime.residentActors = state.world.layout.navigation.slice(0, 4).map((node, index) => ({ residentId: `ambient-${index}`,
    actor: { position: { x: node.x, y: node.y }, nodeId: node.id, targetNodeId: null, previousNodeId: null, restUntil: now + index * 700, steps: index } }));
  return state;
}

/** Apply server activity to an existing live view without replacing its camera/layout or demo state. */
export function projectLiveActivity(state: TownSession, snapshot: ChatSnapshot): TownSession {
  if (state.world.id !== snapshot.townId || state.world.streamerTwitchUserId !== snapshot.channel.twitchUserId) return state;
  const samples = snapshot.sampleAgesMs.filter((age) => Number.isFinite(age) && age >= 0 && age < 60_000).slice(-2000)
    .map((age, i) => ({ userId: `activity-${i}`, message: "", at: state.runtime.now - age }));
  return { ...state, runtime: { ...state.runtime, activity: calculateActivity(samples, state.runtime.now) } };
}
