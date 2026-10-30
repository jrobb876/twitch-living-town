/** Public artifacts must never contain explicitly enabled development tools. */
export function assertPublicBuild(env: Record<string, string | undefined>) {
  if (env.PUBLIC_DEPLOYMENT === "true" && env.TOWN_DEMO_MODE === "true") throw new Error("Public deployments must build with TOWN_DEMO_MODE=false.");
}
