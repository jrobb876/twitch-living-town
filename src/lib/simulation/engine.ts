import { calculateActivity, recordChat } from "./activity";
import { advanceActor, advanceMayor } from "./behavior";
import { housesIn, newHouseAppearance } from "./world";
import type { EventOutcome, Resident, TownEffect, TownEvent, TownSession, TwitchIdentity } from "./types";

/** Advance transient state using an injected monotonic millisecond clock. */
export function tickTown(state: TownSession, now: number): TownSession {
  if (!Number.isFinite(now) || now <= state.runtime.now) return state;
  const dt = Math.min(250, now - state.runtime.now);
  const activity = calculateActivity(state.runtime.activity.samples, now);
  const runtime = { ...state.runtime, now, activity,
    effects: state.runtime.effects.filter((effect) => effect.expiresAt > now),
    mayor: advanceMayor(state.runtime.mayor, state.world, now, dt, activity.score),
    residentActors: state.runtime.residentActors.map(({ residentId, actor }, index) => ({ residentId,
      actor: advanceActor(actor, state.world, now, dt, activity.score, index + 1) })),
  };
  return { world: state.world, runtime };
}

/** Internal event boundary. Future Twitch adapters supply normalized, verified events. */
export function processEvent(state: TownSession, event: TownEvent, receivedAt = state.runtime.now): { state: TownSession; outcome: EventOutcome } {
  const outcome: EventOutcome = { eventId: event.id, type: event.type, status: "applied", message: "", houseIds: [], residentIds: [] };
  const reject = (message: string) => ({ state, outcome: { ...outcome, status: "rejected" as const, message } });
  if (event.townId !== state.world.id) return reject("Event belongs to a different town.");
  if (!event.id.trim() || !Number.isFinite(event.occurredAt) || !Number.isFinite(receivedAt) || receivedAt < state.runtime.now) return reject("Invalid event identity or clock.");
  const previous = state.world.processedEvents.find((item) => item.eventId === event.id);
  if (previous) return { state, outcome: { ...previous, status: "duplicate", message: "Already processed; town unchanged." } };
  const identities = "user" in event ? [event.user, ...(event.type === "NEW_SUBSCRIBER" && event.gift ? [event.gift.gifter] : [])]
    : event.type === "GIFT_SUBSCRIPTION" ? [event.gifter, ...event.recipients] : [event.raider];
  if (identities.some((user) => user !== null && (!user.twitchUserId.trim() || !user.displayName.trim()))) return reject("A Twitch identity is missing.");
  if (event.type === "GIFT_SUBSCRIPTION" && (!event.groupId.trim() || !Number.isSafeInteger(event.total) || event.total < 0)) return reject("Invalid gift group or count.");
  if (event.type === "NEW_SUBSCRIBER" && event.gift && !event.gift.groupId.trim()) return reject("Missing gift correlation ID.");
  if (event.type === "RESUBSCRIPTION" && (!Number.isSafeInteger(event.cumulativeMonths) || event.cumulativeMonths < 1)) return reject("Invalid cumulative subscription months.");
  if (event.type === "INCOMING_RAID" && (!Number.isSafeInteger(event.viewers) || event.viewers < 1)) return reject("Invalid raid viewer count.");
  const gift = event.type === "GIFT_SUBSCRIPTION" ? { groupId: event.groupId, gifter: event.gifter }
    : event.type === "NEW_SUBSCRIBER" ? event.gift : undefined;
  if (gift) {
    const existing = state.world.giftGroups.find((group) => group.id === gift.groupId);
    if (existing && existing.gifter?.twitchUserId !== gift.gifter?.twitchUserId) return reject("Gift group has a different gifter.");
  }
  // Copy only at the event boundary. Ticks retain the durable world reference.
  const next = structuredClone(tickTown(state, receivedAt));
  const { world, runtime } = next;
  const now = runtime.now;
  if ("subscription" in event && event.subscription) {
    const prior = world.residents.find((resident) => resident.twitchUserId === event.user.twitchUserId)?.subscription;
    if (prior && prior.verifiedAt > event.subscription.verifiedAt) {
      outcome.message = "Older subscription evidence ignored.";
      world.processedEvents.push(outcome); return { state: next, outcome };
    }
  }
  function effect(kind: TownEffect["kind"], label: string, position = world.layout.hall, lifetime = 8000) {
    runtime.effects.push({ id: `${event.id}:${runtime.effects.length}`, kind, label, position: { ...position }, startedAt: now, expiresAt: now + lifetime });
    runtime.effects = runtime.effects.slice(-32);
  }
  function mayorTask(nodeId: string, kind: "celebrate" | "welcome", lifetime = 120000) {
    if (!runtime.mayor.tasks.some((task) => task.nodeId === nodeId)) {
      runtime.mayor.tasks.push({ nodeId, kind, expiresAt: now + lifetime });
      runtime.mayor.tasks = runtime.mayor.tasks.slice(-16);
      runtime.mayor.restUntil = now;
      runtime.mayor.behavior = "approaching";
    }
  }
  function resident(user: TwitchIdentity): Resident {
    let record = world.residents.find((item) => item.twitchUserId === user.twitchUserId);
    if (!record) {
      record = { ...user, id: `${world.id}:resident:${user.twitchUserId}`, isFollower: false, isSubscriber: false,
        subscriptionMonths: 0, houseId: null, housingStatus: "none" };
      world.residents.push(record);
      const node = world.layout.navigation.find((node) => node.id === "hall")!;
      if (runtime.residentActors.length < 24) runtime.residentActors.push({ residentId: record.id,
        actor: { position: { x: node.x, y: node.y }, nodeId: node.id, targetNodeId: null, previousNodeId: null, restUntil: now, steps: world.residents.length } });
      outcome.residentIds.push(record.id);
    } else record.displayName = user.displayName;
    return record;
  }
  function subscribe(user: TwitchIdentity, months = 1): Resident {
    const record = resident(user);
    record.isSubscriber = true; record.subscriptionMonths = Math.max(record.subscriptionMonths, months);
    if ("subscription" in event && event.subscription) record.subscription = { ...event.subscription };
    if (record.houseId) {
      const existing = housesIn(world).find((house) => house.id === record.houseId);
      if (existing?.property) existing.property.status = "verified_subscriber";
      return record;
    }
    const plot = world.plots.find((item) => !item.buildingId)
      ?? world.plots.find((item) => housesIn(world).some((house) => house.id === item.buildingId && house.ownerTwitchUserId === null));
    if (!plot) { record.housingStatus = "waiting"; return record; }
    let house = housesIn(world).find((item) => item.id === plot.buildingId);
    if (!house) {
      house = { id: `house:${plot.id}`, kind: "house", plotId: plot.id, position: { ...plot.position },
        ownerTwitchUserId: user.twitchUserId, appearance: newHouseAppearance(world.seed, world.plots.indexOf(plot)) };
      world.buildings.push(house); plot.buildingId = house.id;
    } else house.ownerTwitchUserId = user.twitchUserId;
    record.houseId = house.id; record.housingStatus = "housed";
    outcome.houseIds.push(house.id);
    effect("housewarming", `A home for ${user.displayName}!`, house.position, 12000);
    mayorTask(plot.entranceNodeId, "celebrate");
    return record;
  }
  function giftSubscriptions(groupId: string, gifter: TwitchIdentity | null, total: number, recipients: TwitchIdentity[]) {
    let group = world.giftGroups.find((item) => item.id === groupId);
    if (!group) {
      group = { id: groupId, gifter: gifter ? { ...gifter } : null, announcedCount: total, recipientIds: [] };
      world.giftGroups.push(group);
      effect("gift", `Thank you, ${gifter?.displayName ?? "anonymous neighbor"}, for the gifts!`, world.layout.plaza, 12000);
    }
    group.announcedCount = Math.max(group.announcedCount, total);
    for (const recipient of recipients) {
      if (group.recipientIds.includes(recipient.twitchUserId)) continue;
      group.recipientIds.push(recipient.twitchUserId); subscribe(recipient);
    }
    outcome.message = `Gifts from ${gifter?.displayName ?? "anonymous neighbor"}: ${Math.max(group.announcedCount, group.recipientIds.length)} total, ${group.recipientIds.length} identified recipients. Counts are reconciled per gift group.`;
  }
  switch (event.type) {
    case "CHAT_MESSAGE": {
      const before = calculateActivity(runtime.activity.samples, now).samples.length;
      runtime.activity = recordChat(runtime.activity, event.user.twitchUserId, event.message, now);
      outcome.message = runtime.activity.samples.length > before ? `${event.user.displayName} brought a little energy to town.` : "Chat received; repeated or rapid messages earn no extra activity.";
      break;
    }
    case "NEW_FOLLOWER": {
      const record = resident(event.user);
      if (!record.isFollower) { record.isFollower = true; effect("arrival", `Welcome, ${event.user.displayName}!`); }
      outcome.message = `${event.user.displayName} is a follower resident. No subscriber house added.`;
      break;
    }
    case "NEW_SUBSCRIBER": {
      if (event.gift) giftSubscriptions(event.gift.groupId, event.gift.gifter, 0, [event.user]);
      else {
        const record = subscribe(event.user, event.subscription ? 0 : 1);
        outcome.message = record.houseId ? `${event.user.displayName} has a home. Existing ownership is preserved.` : `${event.user.displayName} joined the housing waitlist; all 14 plots are allocated.`;
      }
      break;
    }
    case "RESUBSCRIPTION": {
      const record = subscribe(event.user, event.cumulativeMonths);
      const house = housesIn(world).find((item) => item.id === record.houseId);
      effect("welcome-back", `Welcome back, ${event.user.displayName}!`, house?.position);
      if (house) mayorTask(world.plots.find((plot) => plot.id === house.plotId)!.entranceNodeId, "celebrate");
      outcome.message = `${event.user.displayName}: ${record.subscriptionMonths} months. One resident, at most one home.`;
      break;
    }
    case "SUBSCRIPTION_ENDED": {
      const record = resident(event.user);
      record.isSubscriber = false; record.subscription = { ...event.subscription, active: false };
      if (!record.houseId) record.housingStatus = "none";
      const house = housesIn(world).find((house) => house.id === record.houseId);
      if (house) { house.property = { size: "small", prestige: 0, customization: {}, ...house.property, status: "legacy" }; outcome.houseIds.push(house.id); }
      outcome.message = "Subscription ended; existing property retained.";
      break;
    }
    case "GIFT_SUBSCRIPTION": giftSubscriptions(event.groupId, event.gifter, event.total, event.recipients); break;
    case "INCOMING_RAID":
      effect("raid", `${event.raider.displayName} + ${event.viewers} visitors!`, world.layout.hall, 20000);
      // Welcoming takes priority, but a delayed Mayor task expires with the raid.
      runtime.mayor.tasks = runtime.mayor.tasks.filter((task) => task.nodeId !== "hall");
      runtime.mayor.tasks.unshift({ nodeId: "hall", kind: "welcome", expiresAt: now + 20000 });
      runtime.mayor.restUntil = now;
      outcome.message = `${event.viewers} temporary visitors welcomed at Town Hall. No permanent houses or residents added.`;
      break;
    default: {
      const unsupported: never = event;
      throw new Error(`Unsupported internal event: ${JSON.stringify(unsupported)}`);
    }
  }
  const waiting = world.residents.filter((record) => record.housingStatus === "waiting").length;
  if (waiting && event.type === "GIFT_SUBSCRIPTION") outcome.message += ` ${waiting} subscriber(s) await more housing.`;
  world.processedEvents.push(outcome);
  // Preserve stable geometry references on chat/follower/raid events so observers
  // need not rebuild the overview or discard camera state.
  world.layout = state.world.layout;
  if (!outcome.houseIds.length && !("subscription" in event && event.subscription)) { world.buildings = state.world.buildings; world.plots = state.world.plots; }
  return { state: next, outcome };
}
