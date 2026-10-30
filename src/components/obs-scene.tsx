"use client";
import { useEffect, useRef, useState } from "react";
import type { TownRenderer } from "@/lib/rendering/create-renderer";
import { OverlayPlayback } from "@/lib/overlay/playback";
import type { OverlaySnapshot } from "@/lib/overlay/service";

export default function ObsScene({ townId }: { townId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Connecting to saved town…");
  useEffect(() => {
    const life = new AbortController(), playback = new OverlayPlayback(townId);
    let renderer: TownRenderer | null = null, pollTimer: ReturnType<typeof setTimeout> | undefined;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("key") ?? "";
    async function poll() {
      let retry = true;
      try {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { retry = false; setStatus("OBS access is missing. Generate a URL in your dashboard."); return; }
        const response = await fetch(`/api/overlay/${encodeURIComponent(townId)}${playback.revision ? `?revision=${playback.revision}` : ""}`, {
          headers: { Authorization: `Bearer ${token}` }, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
          signal: AbortSignal.any([life.signal, AbortSignal.timeout(12000)]),
        });
        if (life.signal.aborted) return;
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          playback.clear(); renderer?.destroy(); renderer = null; retry = false;
          setStatus("OBS access revoked or invalid. Replace the Browser Source URL from your dashboard."); return;
        }
        if (!response.ok) throw new Error("unavailable");
        const data: OverlaySnapshot = await response.json();
        if (life.signal.aborted) return;
        playback.receive(data, Date.now());
        if (!renderer && host.current && playback.session) {
          const { createTownRenderer } = await import("@/lib/rendering/create-renderer");
          if (life.signal.aborted) return;
          renderer = await createTownRenderer(host.current, playback.session, life.signal, playback.settings);
        }
        renderer?.setDisplay(playback.settings);
        setStatus(data.activity.ready ? `Live chat · ${data.activity.receivedMessages} messages` : `Chat ${data.activity.status} · saved town`);
      } catch {
        if (!life.signal.aborted) { playback.unavailable(); setStatus(playback.session ? "Backend unavailable · retrying · last saved view" : "Backend unavailable · retrying"); }
      } finally { if (!life.signal.aborted && retry) pollTimer = setTimeout(() => void poll(), 3000); }
    }
    void poll();
    const animation = setInterval(() => {
      const reaction = playback.tick(Date.now());
      if (playback.session) renderer?.update(playback.session);
      if (reaction) renderer?.focusEvent(reaction.position, 5);
    }, 100);
    return () => { life.abort(); clearTimeout(pollTimer); clearInterval(animation); playback.clear(); renderer?.destroy(); };
  }, [townId]);
  return <main className="obs-root" aria-label="Living Town OBS display"><div className="obs-canvas" ref={host} /><p className="obs-status" role="status">{status}</p></main>;
}
