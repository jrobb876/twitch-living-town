import type { NextConfig } from "next";
import { assertPublicBuild } from "./src/lib/security/deployment";

assertPublicBuild(process.env);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  logging: { incomingRequests: { ignore: [/\/api\/auth\/twitch\/callback/] } },
  poweredByHeader: false,
  async headers() { return [{ source: "/:path*", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Frame-Options", value: "DENY" },
    ...(process.env.PUBLIC_DEPLOYMENT === "true" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
  ] }]; },
};
export default nextConfig;
