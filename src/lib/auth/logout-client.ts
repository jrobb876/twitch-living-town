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
