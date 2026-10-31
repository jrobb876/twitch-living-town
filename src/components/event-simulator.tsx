"use client";

import { useRef, useState } from "react";
import { processEvent } from "@/lib/simulation/engine";
import { availablePlots } from "@/lib/simulation/expansion";
import { neighborhoodLabel } from "@/lib/simulation/population";
import type { EventOutcome, TownEvent, TownSession, TwitchIdentity } from "@/lib/simulation/types";

type Props = { state: TownSession; onEvent: (event: TownEvent) => void; onReset: () => void };
export default function EventSimulator({ state, onEvent, onReset }: Props) {
  const sequence = useRef(0);
  const [lastEvent, setLastEvent] = useState<TownEvent | null>(null);
  const [result, setResult] = useState<EventOutcome | null>(null);
  const [lastGifts, setLastGifts] = useState<{ groupId: string; gifter: TwitchIdentity; recipients: TwitchIdentity[] } | null>(null);
  function identity(prefix = "Neighbor"): TwitchIdentity {
    sequence.current++;
    return { twitchUserId: `sim-${crypto.randomUUID()}`, displayName: `${prefix} ${sequence.current}` };
  }
  function base() { return { id: `sim-event-${crypto.randomUUID()}`, townId: state.world.id, occurredAt: state.runtime.now }; }
  function send(event: TownEvent) {
    // Preview the same pure processor result for immediate, accessible feedback.
    setResult(processEvent(state, event).outcome); setLastEvent(event); onEvent(event);
  }
  function chat(burst: boolean) {
    for (let index = 0; index < (burst ? 8 : 1); index++) send({ ...base(), type: "CHAT_MESSAGE",
      user: burst ? { twitchUserId: `sim-chatter-${index}`, displayName: `Chatter ${index + 1}` } : { twitchUserId: "sim-chatter-0", displayName: "Chatter 1" },
      message: `What a lovely village ${sequence.current++}!` });
  }
  function addSubscribers(count: number) {
    let preview = state;
    for (let i = 0; i < count; i++) {
      const event: TownEvent = { ...base(), type: "NEW_SUBSCRIBER", user: identity("Demo subscriber") };
      const next = processEvent(preview, event); preview = next.state;
      setResult(next.outcome); setLastEvent(event); onEvent(event);
    }
  }
  const recent = state.world.processedEvents.slice(-5).reverse();
  return <details className="event-simulator">
    <summary>Event simulator <span>SIMULATED · LOCAL ONLY</span></summary>
    <p>Sample Twitch identities. No login or live connection. Changes disappear on reset or reload.</p>
    <div className="simulator-buttons">
      <button onClick={() => chat(false)}>Chat message</button>
      <button onClick={() => chat(true)}>Chat burst · 8 people</button>
      <button onClick={() => send({ ...base(), type: "CHAT_MESSAGE", user: { twitchUserId: "sim-spammer", displayName: "Repeat chatter" }, message: "Same message" })}>Repeated chat</button>
      <button onClick={() => send({ ...base(), type: "NEW_FOLLOWER", user: identity("Follower") })}>New follower</button>
      <button onClick={() => send({ ...base(), type: "NEW_SUBSCRIBER", user: identity("Subscriber") })}>New subscriber</button>
      <button disabled={!state.world.residents.some((resident) => resident.isSubscriber)} onClick={() => {
        const existing = state.world.residents.find((resident) => resident.isSubscriber);
        if (existing) send({ ...base(), type: "RESUBSCRIPTION", user: existing, cumulativeMonths: existing.subscriptionMonths + 1 });
      }}>Resubscription</button>
      <button onClick={() => send({ ...base(), type: "NEW_SUBSCRIBER", user: identity("Gift recipient"),
        subscription: { active: true, tier: "1000", isGift: true, source: "eventsub", verifiedAt: state.runtime.now } })}>Individual gift · simulated</button>
      <button onClick={() => {
        const gifts = { groupId: `sim-gift-${crypto.randomUUID()}`, gifter: identity("Gifter"), recipients: [identity("Gift neighbor"), identity("Gift neighbor")] };
        setLastGifts(gifts); send({ ...base(), type: "GIFT_SUBSCRIPTION", ...gifts, total: 2 });
      }}>Gift 2 subscriptions</button>
      <button disabled={!lastGifts} onClick={() => {
        const gifts = lastGifts;
        if (!gifts) return;
        for (const user of gifts.recipients) send({ ...base(), type: "NEW_SUBSCRIBER", user, gift: { groupId: gifts.groupId, gifter: gifts.gifter } });
      }}>Replay gift recipients</button>
      <button onClick={() => send({ ...base(), type: "INCOMING_RAID", raider: identity("Raider"), viewers: 25 })}>Incoming raid · 25</button>
      <button disabled={!lastEvent} onClick={() => lastEvent && send(lastEvent)}>Retry last event ID</button>
      <button onClick={onReset}>Reset demo town</button>
    </div>
    <p>{neighborhoodLabel(state.world)} · {state.world.plots.length} total plots · {availablePlots(state.world)} available housing slots. Use Fit town (0) after expanding.</p>
    <div className="simulator-buttons" aria-label="Development-only neighborhood expansion">
      <button onClick={() => addSubscribers(availablePlots(state.world) || 1)}>Fill existing capacity</button>
      <button onClick={() => addSubscribers(12)}>Add 12 demo subscribers</button>
      <button onClick={() => addSubscribers(48)}>Add 48 demo subscribers</button>
    </div>
    {result && <p role="status" className="simulator-result">{result.status}: {result.message}</p>}
    <ol className="event-log" aria-label="Recent simulated events">
      {recent.map((event) => <li key={event.eventId}><strong>{event.type.replaceAll("_", " ")}</strong> {event.message}</li>)}
      {!recent.length && <li>No simulated events yet.</li>}
    </ol>
  </details>;
}
