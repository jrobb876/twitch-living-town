import MayorPortrait from "./mayor-portrait";

export default function TownLoading({ message = "Getting your town ready…", compact = false }: { message?: string; compact?: boolean }) {
  return <div className={`town-loading${compact ? " town-loading-compact" : ""}`} role="status" aria-live="polite" aria-atomic="true">
    <div className="loading-mayor" aria-hidden="true"><MayorPortrait name="The Mayor" preset="cream" /></div>
    <p>{message}</p><span className="loading-dots" aria-hidden="true"><i /><i /><i /></span>
  </div>;
}
