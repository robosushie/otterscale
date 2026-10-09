const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const PRESETS: Record<string, number> = {
  "1 hour": HOUR_MS,
  "24 hours": 24 * HOUR_MS,
  "7 days": 7 * DAY_MS,
  "90 days": 90 * DAY_MS,
};

function presetMs(label: string): number | undefined {
  return PRESETS[label] ?? PRESETS[label.toLowerCase()];
}

export const AUTH_KEY_EXPIRY_PRESETS = ["1 hour", "24 hours", "7 days", "90 days"] as const;

export const DEFAULT_AUTH_KEY_EXPIRY = "24 hours";

/** Parse an Add-device expiry field. Empty uses the 24h default. Invalid returns null. */
export function parseAuthKeyExpiry(raw: string, from = new Date()): Date | null {
  const value = raw.trim();
  if (!value) {
    return new Date(from.getTime() + PRESETS[DEFAULT_AUTH_KEY_EXPIRY]);
  }

  const preset = presetMs(value);
  if (preset) {
    return new Date(from.getTime() + preset);
  }

  const compact = value.match(/^(\d+)(h|d)$/i);
  if (compact) {
    const amount = Number(compact[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const unit = compact[2].toLowerCase();
    const ms = unit === "h" ? amount * HOUR_MS : amount * DAY_MS;
    return new Date(from.getTime() + ms);
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  if (date.getTime() <= from.getTime()) return null;
  return date;
}
