"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authMessages } from "@/lib/auth/messages";
import type { ChatSnapshot } from "@/lib/chat/types";

type Props = { mode: "live" | "simulated"; onMode: (mode: "live" | "simulated") => void; onSnapshot: (snapshot: ChatSnapshot | null) => void };
export default function ChatConnection({ mode, onMode, onSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState<ChatSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/chat/status", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setSnapshot(null); onSnapshot(null);
          setStatusError(data.error === "unauthorized" ? null : authMessages[data.error] ?? authMessages.unavailable);
        } else { setStatusError(null); setSnapshot(data); onSnapshot(data); }
      } catch {
        if (!controller.signal.aborted) { setStatusError("Connection status is unavailable. Showing the simulated town until you select the live view again."); setSnapshot(null); onSnapshot(null); }
      } finally { inFlight = false; }
    }
    void poll();
    const interval = window.setInterval(poll, 1000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [onSnapshot]);
  async function control(action: "authorize" | "start" | "stop") {
    if (!snapshot || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/chat/${action}`, { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": snapshot.csrfToken } });
      const data = await response.json();
      if (!response.ok) { setError(authMessages[data.error] ?? authMessages.unavailable); return; }
      if (action === "authorize") window.location.assign(data.location);
      else if (action === "start") onMode("live");
    } catch { setError(authMessages.unavailable); }
    finally { setBusy(false); }
  }
  return <section className="chat-connection" aria-label="Twitch chat connection">
    <div className="chat-connection-title"><strong>Twitch chat</strong><span className="chat-mode">{mode === "live" ? "LIVE SOURCE" : "SIMULATED"}</span></div>
    {snapshot ? <>
      <p>Channel: <strong>{snapshot.channel.displayName}</strong> (@{snapshot.channel.login}) · Chat permission: {snapshot.authorized ? "authorized" : "not granted"}</p>
      <p role="status">EventSub: <strong>{snapshot.status}</strong> · Last event: {snapshot.lastEventAt ? new Date(snapshot.lastEventAt).toLocaleTimeString() : "waiting for chat"} · {snapshot.receivedMessages} messages received</p>
      <p>WebSocket: {snapshot.socketConnected ? "connected" : "not connected"} · Chat subscription: <strong>{snapshot.subscriptionReady ? "ready (channel.chat.message)" : "not ready"}</strong></p>
      <div className="chat-actions">
        {!snapshot.authorized ? <button className="account-button" disabled={busy} onClick={() => void control("authorize")}>Authorize Twitch Chat</button>
          : <><button className="account-button" disabled={busy || ["connected", "connecting", "reconnecting"].includes(snapshot.status)} onClick={() => void control("start")}>{snapshot.status === "disconnected" ? "Connect Chat" : "Reconnect Chat"}</button>
            <button className="account-button" disabled={busy || snapshot.status === "disconnected"} onClick={() => void control("stop")}>Disconnect Chat</button></>}
        <button className="account-button" disabled={!snapshot.authorized || mode === "live"} onClick={() => onMode("live")}>View live town</button>
        <button className="account-button" disabled={mode === "simulated"} onClick={() => onMode("simulated")}>View simulated town</button>
      </div>
      <p className="chat-note">Only your own channel can connect. Live and simulated activity stay separate. Ambient townspeople are scenery, not followers or subscribers.</p>
    </> : <p><Link href="/account">Connect your Twitch account</Link> to authorize chat for your own channel.</p>}
    {(error || statusError) && <p className="account-error" role="alert">{error || statusError}</p>}
  </section>;
}
