export function simulatorEnabled(nodeEnv: string | undefined, demoMode: string | undefined): boolean {
  return nodeEnv === "development" || demoMode === "true";
}
