import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AuthService } from "../auth/service";
import { AuthError, isAuthError } from "../auth/types";
import { cookieNames } from "../auth/config";
import { safeEqual } from "../auth/crypto";
import { isPersistenceError, PersistenceError } from "../persistence/types";
import { readTownInput } from "../persistence/http";
import { exteriorSchema } from "./customization";
import { SubscriberDemoStore, subscriberDemoEnabled } from "./subscriber-demo";

export function subscriberDemoHandlers(authService: () => AuthService, store: SubscriberDemoStore, enabled = () => subscriberDemoEnabled()) {
  const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  async function handle(request: NextRequest) {
    // Check before initializing auth or reading input; query/header flags cannot enable this.
    if (!enabled() || !["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)) return response({ error: "not_found" }, 404);
    try {
      const auth = authService(), id = request.cookies.get(cookieNames(false).session)?.value;
      const mutation = request.method !== "GET";
      if (mutation && (request.nextUrl.origin !== auth.config.origin || request.headers.get("origin") !== auth.config.origin || request.headers.get("sec-fetch-site") === "cross-site")) throw new AuthError("forbidden");
      const profile = await auth.getProfile(id, mutation);
      if (!profile || !id) throw new AuthError("unauthorized");
      const csrfToken = auth.csrfToken(id);
      if (mutation && !safeEqual(csrfToken, request.headers.get("x-csrf-token") ?? "")) throw new AuthError("forbidden");
      if (request.method === "GET") return response({ ...store.read(id, profile), csrfToken });
      const raw = await readTownInput(request);
      if (request.method === "POST") {
        const body = z.object({ action: z.enum(["activate", "reset"]) }).strict().parse(raw);
        return response({ ...store.activate(id, profile, body.action === "reset"), csrfToken });
      }
      if (request.method !== "PATCH") throw new PersistenceError("forbidden");
      const body = z.object({ houseId: z.string().min(1).max(256), revision: z.number().int().positive(), exterior: exteriorSchema }).strict().parse(raw);
      return response({ ...store.save(id, profile, body.houseId, body.revision, body.exterior), csrfToken });
    } catch (error) {
      const code = isAuthError(error) || isPersistenceError(error) ? error.code : error instanceof z.ZodError ? "invalid_input" : "unavailable";
      return response({ error: code, message: code === "unauthorized" ? "Sign in with Twitch to try the subscriber demo." : code === "conflict" ? "The demo changed. Reload before saving." : "The subscriber demo could not be opened or changed. Please retry from the Dashboard." },
        code === "unauthorized" ? 401 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "conflict" ? 409 : code === "invalid_input" ? 400 : 503);
    }
  }
  return { GET: handle, POST: handle, PATCH: handle };
}
