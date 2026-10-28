export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeAuth } = await import("./lib/auth/server");
    await initializeAuth();
  }
}
