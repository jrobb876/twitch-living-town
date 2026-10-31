import HomeAction from "./home-action";
import MayorPortrait from "./mayor-portrait";
import TownPreview from "./town-preview";
import { publicSampleTown } from "@/lib/simulation/public-sample";

export default function PublicHome() {
  return <main className="public-home page-enter">
    <section className="home-hero"><div className="hero-copy"><div className="eyebrow">A LITTLE PLACE TO BELONG</div><h1>Your stream.<br />Your community.<br /><em>A world that grows with you.</em></h1>
      <p>Turn your Twitch community into a living virtual town. Give subscribers their own customizable homes, watch neighborhoods grow, and let your animated Mayor bring every stream to life.</p>
      <div className="workspace-actions"><HomeAction /><a className="account-button" href="#how-it-works">Explore Living Town</a></div>
      <div className="hero-mayor"><MayorPortrait name="Mochi" preset="cream" /><p>Small paws. Big responsibilities.<br /><strong>Meet your community’s cat Mayor.</strong></p></div>
    </div><figure className="home-village"><TownPreview world={publicSampleTown()} /><figcaption>A peek at Meadowbrook, our sample village. Wander with the camera controls.</figcaption></figure></section>
    <section className="home-audiences" aria-label="A home for everyone"><article><span aria-hidden="true">✿</span><h2>For Streamers</h2><p>Create your community’s corner of the world.</p><ul><li>Personalize your town and name your Mayor.</li><li>Connect Twitch activity and welcome your neighbors.</li><li>Bring your town or Mayor into OBS.</li></ul></article>
      <article><span aria-hidden="true">⌂</span><h2>For Viewers</h2><p>Every community, a little place to belong.</p><ul><li>Find homes linked to your Twitch identity.</li><li>Customize your eligible subscriber houses.</li><li>Explore the communities you call home.</li></ul></article></section>
    <section id="how-it-works" className="home-how"><div className="eyebrow">GROW SOMETHING TOGETHER</div><h2>From your stream to your streets.</h2><ol><li><span>01</span><h3>Connect with Twitch</h3><p>One account for your town and all your homes.</p></li><li><span>02</span><h3>Find your place</h3><p>Create a town or discover houses from participating communities.</p></li><li><span>03</span><h3>Watch it grow</h3><p>Welcome verified subscribers, explore new neighborhoods, and make your stream feel alive.</p></li></ol><p>Subscriber homes appear when a participating streamer connects and syncs their community. Signing in alone does not create a house.</p></section>
    <footer className="home-footer">Every community deserves a place to call home. <span aria-hidden="true">❧</span></footer>
  </main>;
}
