import { PersistenceError } from "./types";
export function parseDatabaseConfig(env: Record<string, string | undefined>) {
  const key = env.SUPABASE_SECRET_KEY?.trim(), value = env.SUPABASE_URL?.trim();
  if (!key || !value || !key.startsWith("sb_secret_") || key.length < 25 || /replace|placeholder/i.test(key)) throw new PersistenceError("configuration");
  try {
    const url = new URL(value);
    const local = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash
      || url.pathname !== "/") throw new Error();
    return { url: url.origin, key };
  } catch { throw new PersistenceError("configuration"); }
}
