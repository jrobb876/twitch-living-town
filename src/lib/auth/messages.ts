export const authMessages: Record<string, string> = {
  chat_scope: "Chat permission was not granted for this account. Authorize user:read:chat for the same Twitch account and try again.",
  configuration: "Twitch connection is not configured. Check the server environment settings in README.md.",
  state: "This connection attempt expired or could not be verified. Please start again from Connect with Twitch.",
  denied: "Twitch authorization was cancelled. You can continue exploring or connect again.",
  code: "Twitch could not complete that connection attempt. Please start again.",
  unavailable: "Your Twitch connection could not be completed. Please try again shortly.",
  invalid_token: "Your Twitch connection is no longer valid. Please reconnect.",
  expired: "Your session expired. Please reconnect.",
  unauthorized: "Connect with Twitch to view your account.",
  forbidden: "That request was not allowed. For local login, use http://localhost:3000.",
  capacity: "Connections are temporarily busy. Please try again shortly.",
  signed_out: "You have signed out of Living Town.",
};
