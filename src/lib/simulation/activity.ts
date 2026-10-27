import type { Activity } from "./types";

export const CHAT_WINDOW_MS = 60_000;
export const USER_COOLDOWN_MS = 10_000;

export function calculateActivity(samples: Activity["samples"], now: number): Activity {
  const recent = samples.filter((sample) => sample.at <= now && now - sample.at < CHAT_WINDOW_MS);
  const score = Math.min(100, Math.round(recent.reduce((sum, sample) => sum + 10 * (1 - (now - sample.at) / CHAT_WINDOW_MS), 0)));
  return { samples: recent, score, level: score >= 50 ? "lively" : score >= 15 ? "stirring" : "peaceful" };
}

export function recordChat(activity: Activity, userId: string, message: string, now: number): Activity {
  const current = calculateActivity(activity.samples, now);
  const normalized = message.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 500);
  if (!normalized || current.samples.some((sample) => sample.userId === userId && (now - sample.at < USER_COOLDOWN_MS || sample.message === normalized))) return current;
  return calculateActivity([...current.samples, { userId, message: normalized, at: now }], now);
}
