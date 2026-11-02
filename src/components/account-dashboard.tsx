import Link from "next/link";
import type { DashboardData } from "@/lib/persistence/dashboard";
import { mayorLook, mayorPalettes, personalities } from "@/lib/mayor/presets";
import { townVisitPath } from "@/lib/houses/links";
import MayorPortrait from "./mayor-portrait";
import PropertyCards from "./property-cards";
import { neighborhoodLabel } from "@/lib/simulation/population";
import SubscriberDemoEntry from "./subscriber-demo-entry";

export default function AccountDashboard({ data, subscriberDemo = false }: { data: DashboardData; subscriberDemo?: boolean }) {
  const { profile, town, houses, townUnavailable, housesUnavailable } = data;
  const mayor = town?.world.mayor;
  return <main className="streamer-page account-dashboard">
    <header className="dashboard-welcome"><div className="eyebrow">ONE ACCOUNT · ALL YOUR LITTLE CORNERS</div><h1>Welcome home, {profile.displayName}.</h1><p>Your community town and every cottage you call home, together.</p></header>
    <section id="my-town" className="workspace-card"><div className="eyebrow">YOUR COMMUNITY</div><h2>My Town</h2>
      {townUnavailable ? <p role="alert">Your town could not be loaded. <a href="/dashboard">Retry dashboard</a>. Nothing has been created or replaced.</p>
        : town && mayor ? <><div className="welcome-mayor"><MayorPortrait name={mayor.name} preset={mayor.appearance?.preset} /><div><h3>{town.world.name}</h3><p>Mayor {mayor.name} · {mayorPalettes[mayorLook(mayor.appearance?.preset)].label}</p>
          <p>{mayor.personality?.preset ? personalities[mayor.personality.preset].label : "Your saved personality"}{mayor.personality && ` · Curiosity ${Math.round(mayor.personality.curiosity * 100)}% · Energy ${Math.round(mayor.personality.energy * 100)}%`}</p></div></div>
          <p>{town.world.residents.length} residents · {town.world.residents.filter((r) => r.houseId && r.subscription?.active).length} active subscriber homes · {neighborhoodLabel(town.world)} · {town.world.plots.length} plots</p>
          <div className="workspace-actions"><Link className="primary-button" href="/town-overview">Open Town Overview</Link><Link className="account-button" href="/dashboard/town">Manage My Town</Link><Link className="account-button" href={townVisitPath(town.world.id)}>Visit Town</Link></div>
          <p className="dashboard-utilities"><Link href="/dashboard/town#obs">OBS settings</Link> · <Link href="/account">Account details</Link></p></>
          : <><h3>A place for your community</h3><p>You do not have a town yet. Create one whenever you are ready; your houses in other communities are already part of this account.</p><Link className="primary-button" href="/onboarding">Create My Town</Link></>}
    </section>
    <section id="my-houses" className="dashboard-houses"><div className="eyebrow">EVERY COMMUNITY, A PLACE TO BELONG</div><h2>My Houses</h2><p>Your homes across participating towns. Active membership is checked again when you save a customization.</p>
      {housesUnavailable ? <div className="house-empty"><p role="alert">Your houses could not be loaded. <a href="/dashboard">Retry dashboard</a>. Your saved properties are unchanged.</p></div> : <PropertyCards houses={houses} />}
    </section>
    {subscriberDemo && <section id="development-tools" aria-labelledby="development-tools-title">
      <div className="eyebrow">SIMULATED EXPERIENCES · DEVELOPMENT ONLY</div><h2 id="development-tools-title">Development Tools</h2>
      <p>Explore Living Town&apos;s development simulations and testing experiences. These tools use simulated data and do not modify your live Twitch community.</p>
      <div className="house-grid">
        <section className="workspace-card"><h3>OBS Development Preview</h3><p>Preview expanded towns, OBS presentation modes, and simulated Mayor reactions.</p>
          <Link className="account-button" href="/demo/obs-preview">Open OBS Preview</Link></section>
        <SubscriberDemoEntry description="Experience Living Town as a subscriber with a customizable house in Maplebrook." />
        <section className="workspace-card"><h3>Town Simulator</h3><p>Explore a simulated town, trigger community events, and observe neighborhood growth.</p>
          <Link className="account-button" href="/town-overview">Open Town Simulator</Link>
          <p className="workspace-help">If your saved town opens, select View Simulated Town. Opening this link does not reset or change your saved town.</p></section>
      </div>
    </section>}
  </main>;
}
