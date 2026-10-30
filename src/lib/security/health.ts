import { NextResponse } from "next/server";
/** Dependency readiness only, never a claim that Twitch/EventSub is connected. */
export function createHealthHandler(ready: () => Promise<void>, now = Date.now) {
  let check: Promise<boolean> | undefined, expires = 0;
  return async () => {
    if (!check || now() >= expires) {
      expires = now() + 5000;
      check = ready().then(() => true).catch(() => false);
    }
    const ok = await check;
    return NextResponse.json({ status: ok ? "ok" : "unavailable" }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  };
}
