"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createExpandedPreview, previewCounts, previewInput, PREVIEW_RESET_PATH } from "@/lib/overlay/preview";
import { startPreview } from "@/lib/overlay/preview-runtime";
import { defaultDisplay, type DisplaySettings } from "@/lib/overlay/model";
import { neighborhoodLabel } from "@/lib/simulation/population";

function Scene({ count, seed, display, controls }: { count: number; seed: number; display: DisplaySettings; controls: boolean }) {
  const host = useRef<HTMLDivElement>(null), controller = useRef<ReturnType<typeof startPreview> | null>(null);
  const latest = useRef(display);
  const [status, setStatus] = useState("Growing a simulated neighborhood…");
  useEffect(() => { latest.current = display; controller.current?.setDisplay(display); }, [display]);
  useEffect(() => {
    const world = createExpandedPreview(count, seed);
    const owner = startPreview(world, latest.current, async (session, signal, settings) => {
      const { createTownRenderer } = await import("@/lib/rendering/create-renderer");
      if (signal.aborted || !host.current) return null;
      return createTownRenderer(host.current, session, signal, settings);
    });
    controller.current = owner;
    let active = true;
    void owner.ready.then(() => { if (active) setStatus(`${count} simulated houses · ${neighborhoodLabel(world)} · ${world.plots.length} plots · seed ${seed}`); })
      .catch(() => { if (active) setStatus("Preview could not open. Reload with WebGL/hardware acceleration enabled."); });
    return () => { active = false; owner.destroy(); controller.current = null; };
  }, [count, seed]);
  return <><div className="obs-canvas" ref={host} /><p className="obs-status" role="status">{status}</p>
    {controls && display.mode === "spotlight" && <div className="preview-camera" aria-label="Preview background camera">
      <button onClick={() => controller.current?.zoom(1.2)} aria-label="Zoom background in">+</button>
      <button onClick={() => controller.current?.zoom(1 / 1.2)} aria-label="Zoom background out">−</button>
      <button onClick={() => controller.current?.pan(100, 0)} aria-label="Pan background left">←</button>
      <button onClick={() => controller.current?.pan(-100, 0)} aria-label="Pan background right">→</button>
      <button onClick={() => controller.current?.pan(0, 100)} aria-label="Pan background up">↑</button>
      <button onClick={() => controller.current?.pan(0, -100)} aria-label="Pan background down">↓</button>
      <button onClick={() => controller.current?.recenter()}>Recenter</button>
    </div>}</>;
}

export default function ExpandedObsPreview({ initial, initialMode, capture }: {
  initial: { count: number; seed: number }; initialMode: DisplaySettings["mode"]; capture: boolean;
}) {
  const router = useRouter();
  const [applied, setApplied] = useState(initial), [count, setCount] = useState(initial.count), [seed, setSeed] = useState(String(initial.seed));
  const [display, setDisplay] = useState<DisplaySettings>({ ...defaultDisplay, mode: initialMode });
  const [error, setError] = useState("");
  const sceneUrl = `/demo/obs-preview?capture=1&count=${applied.count}&seed=${applied.seed}&mode=${display.mode}`;
  return <main className="obs-root preview-root" aria-label="Development-only simulated OBS preview">
    <Scene key={`${applied.count}:${applied.seed}`} {...applied} display={display} controls={!capture} />
    <strong className="preview-badge">DEMO / SIMULATED DATA</strong>
    {!capture && <section className="preview-panel" aria-label="Expanded town preview controls">
      <div className="eyebrow">A GROWING COMMUNITY</div><h1>A little bigger<span>.</span></h1>
      <p>Fictional neighbors, familiar streets. This separate preview never reads or saves your real town.</p>
      <form onSubmit={(event) => { event.preventDefault(); try { setApplied(previewInput(count, Number(seed))); setError(""); } catch { setError("Enter a whole-number seed from 0 to 4294967295."); } }}>
        <label>Target total houses<select value={count} onChange={(event) => setCount(Number(event.target.value))}>
          {previewCounts.map((n) => <option key={n} value={n}>{n} houses</option>)}
        </select></label>
        <label>Procedural seed<input type="number" min="0" max="4294967295" step="1" required value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
        <button className="primary-button" type="submit">Apply Preview</button>
      </form>
      <label>Presentation<select value={display.mode} onChange={(event) => setDisplay({ ...display, mode: event.target.value as DisplaySettings["mode"] })}>
        <option value="living-town">Living Town · follow Mayor</option><option value="spotlight">Mayor Spotlight</option>
      </select></label>
      <p>{display.mode === "living-town" ? "Camera follows Mochi through the neighborhood automatically." : "Foreground Mayor with a cropped, readable town background. Use the camera buttons below."}</p>
      <a className="account-button" href={sceneUrl} target="_blank" rel="noreferrer">Open OBS capture view ↗</a>
      <p>Use the capture view’s full localhost URL in OBS at 1920 × 1080. Its demo label stays visible.</p>
      <button className="account-button" onClick={() => router.push(PREVIEW_RESET_PATH)}>Reset Preview · return to my town</button>
      {error && <p role="alert">{error}</p>}
    </section>}
  </main>;
}
