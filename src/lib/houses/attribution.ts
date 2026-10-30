import type { AuthService } from "../auth/service";
import type { PropertyView } from "./customization";

/** Call only after owner-filtered property discovery; names are optional, never authorization. */
export async function attributeProperties(auth: AuthService, properties: PropertyView[]): Promise<PropertyView[]> {
  let names: Record<string, string> = {};
  try { names = await auth.knownDisplayNames(properties.map((p) => p.streamerTwitchUserId)); }
  catch { /* Missing optional display metadata must not hide owned properties. */ }
  return properties.map((p) => names[p.streamerTwitchUserId] ? { ...p, streamerName: names[p.streamerTwitchUserId] } : p);
}
