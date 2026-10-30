import Link from "next/link";
import { exteriorOf, type PropertyView } from "@/lib/houses/customization";
import { houseEditorPath, townVisitPath } from "@/lib/houses/links";
import PropertyPreview from "./property-preview";

export default function PropertyCards({ houses }: { houses: PropertyView[] }) {
  if (!houses.length) return <div className="house-empty"><h3>A little place in your community</h3><p>No houses are linked to this Twitch account yet. Once a participating streamer syncs verified subscribers, your home will appear here. Signing in does not create a house.</p></div>;
  return <div className="house-grid">{houses.map((p) => <article className="house-card" key={`${p.townId}:${p.house.id}`}>
    <span className="house-card-icon" aria-hidden="true" style={{ color: `#${p.house.appearance.roofColor.toString(16).padStart(6, "0")}` }}>⌂</span>
    <span className="eyebrow">{p.editable ? "ACTIVE PROPERTY" : "READ-ONLY PROPERTY"}</span>
    <h3>{exteriorOf(p.house).houseName || "Your cozy cottage"}</h3><p>{p.townName}</p>
    <p>{p.streamerName ? `Streamer: ${p.streamerName}` : `Streamer ID: ${p.streamerTwitchUserId} · name unavailable`}</p>
    <div className="workspace-actions"><Link className="account-button" href={townVisitPath(p.townId)}>Visit Town</Link>
      <Link className="account-button" href={houseEditorPath(p.townId, p.house.id)}>{p.editable ? "Customize House" : "View retained house"}</Link>
      <PropertyPreview house={p.house} /></div>
  </article>)}</div>;
}
