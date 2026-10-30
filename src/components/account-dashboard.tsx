import Link from "next/link";
import type { DashboardData } from "@/lib/persistence/dashboard";
import { mayorLook, mayorPalettes, personalities } from "@/lib/mayor/presets";
import { townVisitPath } from "@/lib/houses/links";
import MayorPortrait from "./mayor-portrait";
import PropertyCards from "./property-cards";
import TwitchAccount from "./twitch-account";

export default function AccountDashboard({ data }: { data: DashboardData }) {
  const { profile, town, houses, townUnavailable, housesUnavailable } = data;
  const mayor = town?.world.mayor;
  return <main className="streamer-page account-dashboard">
    <nav className="houses-nav"><Link href="/">Town Overview</Link><TwitchAccount initialAccount={{ user: profile, csrfToken: data.csrfToken }} /></nav>
    <header className="dashboard-welcome"><div className="eyebrow">ONE ACCOUNT · ALL YOUR LITTLE CORNERS</div><h1>Welcome home, {profile.displayName}.</h1><p>Your community town and every cottage you call home, together.</p></header>
    <nav className="workspace-actions" aria-label="Quick access"><Link className="account-button" href="#my-town">My Town</Link><Link className="account-button" href="#my-houses">My Houses</Link>
      {town && <><Link className="account-button" href="/dashboard/town#settings">Streamer settings</Link><Link className="account-button" href="/dashboard/town#obs">OBS presentation</Link></>}
      <Link className="account-button" href="/account">Account details & sign out</Link>
    </nav>
    <section id="my-town" className="workspace-card"><div className="eyebrow">YOUR COMMUNITY</div><h2>My Town</h2>
      {townUnavailable ? <p role="alert">Your town could not be loaded. <a href="/dashboard">Retry dashboard</a>. Nothing has been created or replaced.</p>
        : town && mayor ? <><div className="welcome-mayor"><MayorPortrait name={mayor.name} preset={mayor.appearance?.preset} /><div><h3>{town.world.name}</h3><p>Mayor {mayor.name} · {mayorPalettes[mayorLook(mayor.appearance?.preset)].label}</p>
          <p>{mayor.personality?.preset ? personalities[mayor.personality.preset].label : "Your saved personality"}{mayor.personality && ` · Curiosity ${Math.round(mayor.personality.curiosity * 100)}% · Energy ${Math.round(mayor.personality.energy * 100)}%`}</p></div></div>
          <div className="workspace-actions"><Link className="primary-button" href="/dashboard/town">Manage My Town</Link><Link className="account-button" href={townVisitPath(town.world.id)}>Visit Town</Link><Link className="account-button" href="/dashboard/town#settings">Town & Mayor settings</Link><Link className="account-button" href="/dashboard/town#obs">Configure OBS</Link></div></>
          : <><h3>A place for your community</h3><p>You do not have a town yet. Create one whenever you are ready; your houses in other communities are already part of this account.</p><Link className="primary-button" href="/onboarding">Create My Town</Link></>}
    </section>
    <section id="my-houses" className="dashboard-houses"><div className="eyebrow">EVERY COMMUNITY, A PLACE TO BELONG</div><h2>My Houses</h2><p>Your homes across participating towns. Active membership is checked again when you save a customization.</p>
      {housesUnavailable ? <div className="house-empty"><p role="alert">Your houses could not be loaded. <a href="/dashboard">Retry dashboard</a>. Your saved properties are unchanged.</p></div> : <PropertyCards houses={houses} />}
    </section>
  </main>;
}
