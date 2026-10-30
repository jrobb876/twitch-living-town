import { NextResponse, type NextRequest } from "next/server";
import { ApiRateLimiter } from "./lib/security/rate-limit";
// Only this proxy runtime uses this singleton; no shared auth state is assumed.
const limiter = new ApiRateLimiter();
export function proxy(request: NextRequest) { return limiter.check(request) ?? NextResponse.next(); }
export const config = { matcher: "/api/:path*" };
