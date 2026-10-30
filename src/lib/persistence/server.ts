import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parseDatabaseConfig } from "./config";
import { SupabaseTownRepository } from "./repository";
import { TownPersistenceService } from "./service";
import type { Json } from "./types";
import type { RpcClient } from "./repository";

type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Enums: Record<string, never>; CompositeTypes: Record<string, never>;
  Functions: {
    living_town_auth_claim: { Args: { p_holder: Json }; Returns: Json };
    living_town_auth_check: { Args: { p_holder: Json }; Returns: Json };
    living_town_auth_save: { Args: { p_holder: Json; p_sessions: Json; p_revocations: Json }; Returns: Json };
    living_town_display_manage: { Args: { p_owner: Json; p_id: Json; p_action: Json; p_settings?: Json; p_hash?: Json }; Returns: Json };
    living_town_display_read: { Args: { p_id: Json; p_hash: Json }; Returns: Json };
    living_town_owned_towns: { Args: { p_user: Json }; Returns: Json };
    living_town_load: { Args: { p_id?: Json; p_owner?: Json }; Returns: Json };
    living_town_create: { Args: { p_profile: Json; p_world: Json }; Returns: Json };
    living_town_commit: { Args: { p_owner: Json; p_world: Json; p_revision: Json; p_event?: Json }; Returns: Json };
  } } };
let service: TownPersistenceService | undefined;
let rpc: RpcClient | undefined;
export function getTownRpc(): RpcClient {
  if (!rpc) {
    const config = parseDatabaseConfig(process.env);
    const client = createClient<Database>(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) }) } });
    rpc = (name, args) => client.rpc(name, args as never);
  }
  return rpc;
}
export function getTownPersistence() {
  service ??= new TownPersistenceService(new SupabaseTownRepository(getTownRpc()));
  return service;
}
