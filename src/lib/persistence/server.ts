import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parseDatabaseConfig } from "./config";
import { SupabaseTownRepository } from "./repository";
import { TownPersistenceService } from "./service";
import type { Json } from "./types";

type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Enums: Record<string, never>; CompositeTypes: Record<string, never>;
  Functions: {
    living_town_owned_towns: { Args: { p_user: Json }; Returns: Json };
    living_town_load: { Args: { p_id?: Json; p_owner?: Json }; Returns: Json };
    living_town_create: { Args: { p_profile: Json; p_world: Json }; Returns: Json };
    living_town_commit: { Args: { p_owner: Json; p_world: Json; p_revision: Json; p_event?: Json }; Returns: Json };
  } } };
let service: TownPersistenceService | undefined;
export function getTownPersistence() {
  if (!service) {
    const config = parseDatabaseConfig(process.env);
    const client = createClient<Database>(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) }) } });
    service = new TownPersistenceService(new SupabaseTownRepository((name, args) => client.rpc(name, args as never)));
  }
  return service;
}
