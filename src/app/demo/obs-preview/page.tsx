import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { previewEnabled, previewInput } from "@/lib/overlay/preview";
import ExpandedObsPreview from "@/components/expanded-obs-preview";

export const metadata = { title: "Simulated OBS Preview — Living Town", robots: { index: false, follow: false } };
export default async function PreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!previewEnabled(process.env, (await headers()).get("host"))) notFound();
  const query = await searchParams;
  let input;
  try { input = previewInput(Number(query.count ?? 25), Number(query.seed ?? 42)); } catch { notFound(); }
  const mode = query.mode ?? "living-town";
  if (mode !== "living-town" && mode !== "spotlight") notFound();
  return <ExpandedObsPreview initial={input} initialMode={mode} capture={query.capture === "1"} />;
}
