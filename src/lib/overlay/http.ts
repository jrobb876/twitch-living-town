import type { NextRequest } from "next/server";
import type { AuthService } from "../auth/service";
import { createTownIdentity, readTownInput, response, failure } from "../persistence/http";
import { AuthError } from "../auth/types";
import type { OverlayService } from "./service";

export function createOverlayHandlers(auth: () => AuthService, service: () => OverlayService, production: boolean) {
  const identity = createTownIdentity(auth, production);
  return {
    async status(request: NextRequest) {
      try { const { profile } = await identity(request); return response(await service().status(profile, request.nextUrl.searchParams.get("townId") ?? "")); }
      catch (error) { return failure(error); }
    },
    async manage(request: NextRequest) {
      try {
        if (request.method !== "POST") throw new AuthError("forbidden");
        const { profile } = await identity(request, true);
        return response(await service().manage(profile, await readTownInput(request)));
      } catch (error) { return failure(error); }
    },
    async read(request: NextRequest, context: { params: Promise<{ townId: string }> }) {
      try {
        const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
        const revision = Number(request.nextUrl.searchParams.get("revision"));
        const result = response(await service().read((await context.params).townId, token, Number.isSafeInteger(revision) && revision > 0 ? revision : null));
        result.headers.set("Vary", "Authorization"); return result;
      } catch (error) { return failure(error); }
    },
  };
}
