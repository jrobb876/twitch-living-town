"use client";
import { useEffect, useState } from "react";
import { colorNames, colors, customizeHouse, exteriorOf, exteriorSchema, type ExteriorDraft, type PropertyView } from "@/lib/houses/customization";
import HousePreview from "./house-preview";

export default function HouseEditor({ initial, demo = false, onSave, onReload }: { initial: PropertyView; demo?: boolean;
  onSave: (draft: ExteriorDraft, revision: number) => Promise<PropertyView>; onReload?: () => void }) {
  const [saved, setSaved] = useState(initial), [draft, setDraft] = useState(() => exteriorOf(initial.house));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const valid = exteriorSchema.safeParse(draft), dirty = JSON.stringify(draft) !== JSON.stringify(exteriorOf(saved.house));
  const preview = valid.success ? customizeHouse(saved.house, valid.data) : saved.house;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change<K extends keyof ExteriorDraft>(key: K, value: ExteriorDraft[K]) { setDraft((old) => ({ ...old, [key]: value })); setMessage(""); setError(""); }
  async function save() {
    if (!valid.success || busy || !saved.editable) return;
    setBusy(true); setMessage(""); setError("");
    try { const value = await onSave(valid.data, saved.revision); setSaved(value); setDraft(exteriorOf(value.house)); setMessage(demo ? "Applied to this demo town only." : "Saved to your town. Your house is looking lovely."); }
    catch (error) { setError(error instanceof Error ? error.message : "The save could not be confirmed. Reload before trying again."); }
    finally { setBusy(false); }
  }
  return <div className="house-editor">
    <section className="house-preview-panel"><span className="eyebrow">{demo ? "DEMO HOUSE · LOCAL ONLY" : "YOUR LITTLE CORNER"}</span>
      <HousePreview house={preview} /><p>Preview changes appear here immediately. {demo ? "Apply them to the separate demo town below." : "Your town changes only when you save."}</p>
      <div className="house-facts"><span>{saved.townName}</span><span>Home of {saved.ownerName}</span></div>
      <p>House size: {saved.house.property?.size ?? "small"} · Prestige: {saved.house.property?.prestige ?? 0}</p>
    </section>
    <section className="house-editor-controls"><h2>Make yourself at home</h2>
      {!saved.editable && <p className="account-notice">This is a legacy or inactive property. Your home is retained and can be viewed, but editing requires a verified active subscription.</p>}
      <fieldset disabled={busy || !saved.editable}>
        <label className="house-name-label">House name<input value={draft.houseName} maxLength={40} onChange={(e) => change("houseName", e.target.value)} placeholder="A cozy cottage" aria-describedby="house-name-help" /></label>
        <small id="house-name-help">Up to 40 characters. Letters, numbers, spaces, apostrophes, periods and hyphens. Your house name is public.</small>
        {(["roof", "wall", "door", "fence"] as const).map((part) => <div className="house-preset-group" key={part} role="group" aria-label={`${part} color`}>
          <span>{part} color</span><div className="house-swatches">{Object.entries(colorNames).map(([id, name]) => <button type="button" key={id} title={name} aria-label={`${part}: ${name}`} aria-pressed={draft[part] === id}
            onClick={() => change(part, id as ExteriorDraft[typeof part])} style={{ "--swatch": id === "original" ? "#f8f5eb" : `#${colors[id as keyof typeof colors].toString(16).padStart(6, "0")}` } as React.CSSProperties}>
            <i aria-hidden="true">{id === "original" ? "↶" : ""}</i><span>{name}</span></button>)}</div>
        </div>)}
        <div className="house-selects"><label>Garden<select value={draft.garden} onChange={(e) => change("garden", e.target.value as ExteriorDraft["garden"])}><option value="flowers">Cottage flowers</option><option value="herbs">Kitchen herbs</option><option value="stones">Quiet stone garden</option></select></label>
          <label>Finishing touch<select value={draft.accent} onChange={(e) => change("accent", e.target.value as ExteriorDraft["accent"])}><option value="none">Keep it simple</option><option value="lantern">Welcome lantern</option><option value="birdhouse">Little birdhouse</option></select></label></div>
      </fieldset>
      {!valid.success && <p className="house-error" role="alert">{valid.error.issues[0].message}</p>}
      <div className="house-editor-actions"><button className="primary-button" disabled={!saved.editable || busy || !dirty || !valid.success} onClick={() => void save()}>{busy ? "Saving…" : demo ? "Apply to demo town" : "Save house"}</button>
        <button className="account-button" disabled={busy || !dirty} onClick={() => { setDraft(exteriorOf(saved.house)); setError(""); setMessage(""); }}>Reset to Saved</button></div>
      <p role="status">{dirty ? "Unsaved changes" : "All changes saved"}{demo ? " · demo only" : ""}</p>
      {message && <p className="house-success" role="status">{message}</p>}{error && <p className="house-error" role="alert">{error}</p>}
      {onReload && <button className="account-button" disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard your unsaved changes and reload the saved house?")) onReload(); }}>Reload saved house</button>}
    </section>
  </div>;
}
