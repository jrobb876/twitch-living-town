import TownExperience from "@/components/town-experience";
import { simulatorEnabled } from "@/lib/simulation/config";

export default function Home() {
  return <TownExperience enableSimulator={simulatorEnabled(process.env.NODE_ENV, process.env.TOWN_DEMO_MODE)} />;
}
