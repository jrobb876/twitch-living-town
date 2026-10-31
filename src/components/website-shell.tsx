"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AccountProvider, useAccount } from "./account-context";
import TwitchAccount from "./twitch-account";
import { currentSection, primaryNavigation, standalonePresentation } from "@/lib/security/navigation";

export function WebsiteNavigation({ pathname }: { pathname: string }) {
  const account = useAccount(), [open, setOpen] = useState(false);
  const signedIn = !!account?.user;
  return <header className="website-header"><Link className="brand" href="/" aria-label="Living Town home"><span className="brand-mark">⌂<i>✦</i></span><span>living town<span className="brand-subtitle">A LITTLE PLACE TO BELONG</span></span></Link>
    <button className="nav-toggle account-button" type="button" aria-expanded={open} aria-controls="website-navigation" onClick={() => setOpen(!open)}>Menu</button>
    <div id="website-navigation" className={`website-menu${open ? " is-open" : ""}`} onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); document.querySelector<HTMLButtonElement>(".nav-toggle")?.focus(); } }}>
      <nav aria-label="Primary navigation">{signedIn ? primaryNavigation.map(({ href, label }) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={currentSection(pathname) === href ? "page" : undefined}>{label}</Link>) : <><Link href="/" onClick={() => setOpen(false)} aria-current={pathname === "/" ? "page" : undefined}>Home</Link><Link href="/#how-it-works" onClick={() => setOpen(false)}>How it works</Link></>}</nav>
      {pathname !== "/account" && <TwitchAccount compact />}
    </div>
  </header>;
}
export default function WebsiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (standalonePresentation(pathname)) return children;
  return <AccountProvider><a className="skip-link" href="#website-content">Skip to content</a><WebsiteNavigation key={pathname} pathname={pathname} /><div id="website-content" tabIndex={-1} className="website-content">{children}</div></AccountProvider>;
}
