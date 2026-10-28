export type ChatConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "revoked" | "error";
/** Public projection: no OAuth credentials, session keys, chat text or chatter IDs. */
export type ChatSnapshot = {
  channel: { twitchUserId: string; login: string; displayName: string };
  townId: string; authorized: boolean; status: ChatConnectionState;
  socketConnected: boolean; subscriptionReady: boolean;
  lastEventAt: number | null; receivedMessages: number;
  sampleAgesMs: number[]; csrfToken: string;
};
export const liveTownId = (broadcasterId: string) => `twitch:${broadcasterId}`;
