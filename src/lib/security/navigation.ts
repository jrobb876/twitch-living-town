export const primaryNavigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/town-overview", label: "Town Overview" },
  { href: "/dashboard/town", label: "My Town" },
  { href: "/my-houses", label: "My Houses" },
  { href: "/account", label: "Account" },
] as const;
export function currentSection(path: string) {
  if (path === "/onboarding") return "/dashboard/town";
  return [...primaryNavigation].sort((a, b) => b.href.length - a.href.length).find(({ href }) => path === href || path.startsWith(`${href}/`))?.href;
}
/** OBS and the isolated preview must never mount website navigation or auth polling. */
export function standalonePresentation(path: string) { return path.startsWith("/overlay/") || path === "/demo/obs-preview"; }
