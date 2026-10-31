import type { Metadata } from "next";
import "./globals.css";
import WebsiteShell from "@/components/website-shell";

export const metadata: Metadata = {
  title: "Twitch Living Town — A little place to belong",
  description: "A cozy procedural village for your Twitch community, watched over by a very small cat Mayor. An early local prototype.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><WebsiteShell>{children}</WebsiteShell></body></html>;
}
