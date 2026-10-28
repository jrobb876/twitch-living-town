import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  logging: { incomingRequests: { ignore: [/\/api\/auth\/twitch\/callback/] } },
};
export default nextConfig;
