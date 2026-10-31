/** Fixed same-origin target. CORS fetch mode preserves browser-generated Origin
 * under no-referrer; native navigation/form mode does not. Never set Origin by hand. */
export async function logoutAccount(csrfToken: string, send: typeof fetch = fetch) {
  const response = await send("/api/auth/logout", {
    method: "POST", mode: "cors", credentials: "same-origin", redirect: "error",
    cache: "no-store", referrerPolicy: "no-referrer",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken }),
  });
  if (!response.ok || (await response.json()).signedOut !== true) throw new Error("Sign-out failed");
}

/** Navigate only after acknowledged revocation and cookie clearing. Injectable for regression tests. */
export async function signOutToHome(csrfToken: string, navigate: (path: string) => void, send: typeof fetch = fetch) {
  await logoutAccount(csrfToken, send);
  navigate("/");
}
