export async function register() {
  // Build/static generation must never claim durable auth or contact external services.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeAuth } = await import("./lib/auth/server");
    await initializeAuth();
  }
}
