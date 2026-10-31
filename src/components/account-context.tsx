"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AccountProfile } from "@/lib/auth/types";

export type AccountState = { user: AccountProfile | null; csrfToken: string | null; error?: string };
const AccountContext = createContext<AccountState | null | undefined>(undefined);
function useAccountState(initial?: AccountState, enabled = true) {
  const [account, setAccount] = useState<AccountState | null>(initial ?? null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(); let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const data = await response.json() as AccountState;
        if (!controller.signal.aborted) setAccount(data);
      } catch { if (!controller.signal.aborted) setAccount({ user: null, csrfToken: null, error: "unavailable" }); }
      finally { inFlight = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [enabled]);
  return account;
}
export function AccountProvider({ children, initialAccount }: { children?: ReactNode; initialAccount?: AccountState }) {
  const account = useAccountState(initialAccount);
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
export function useAccount(initial?: AccountState) {
  const shared = useContext(AccountContext);
  const local = useAccountState(initial, shared === undefined);
  return shared === undefined ? local : shared;
}
