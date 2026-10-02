export const PAID_CHANNELS = ["Meta", "Google", "Indeed"] as const;
export type PaidChannel = (typeof PAID_CHANNELS)[number];
export const ALL_CHANNELS = ["Meta", "Google", "Indeed", "Organic", "Untracked", "Other"] as const;

const DEFAULT_MAP: Record<string, string> = {
  meta: "Meta", facebook: "Meta", fb: "Meta", ig: "Meta", instagram: "Meta",
  "facebook/instagram": "Meta", "facebook / instagram": "Meta", "meta ads": "Meta",
  google: "Google", "google ads": "Google", adwords: "Google", youtube: "Google", gads: "Google",
  indeed: "Indeed",
  organic: "Organic",
  "": "Untracked", "-": "Untracked", null: "Untracked", none: "Untracked", "(none)": "Untracked", undefined: "Untracked",
};

/** Turn a raw UTM Source value into a channel. Client overrides win. */
export function channelFor(utmSource: string, overrides: Record<string, string> = {}): string {
  const key = (utmSource ?? "").trim().toLowerCase();
  for (const [k, v] of Object.entries(overrides)) if (k.trim().toLowerCase() === key) return v;
  return DEFAULT_MAP[key] ?? "Other";
}

export function isPaid(channel: string): channel is PaidChannel {
  return (PAID_CHANNELS as readonly string[]).includes(channel);
}

/** Fixed colors per channel so every chart matches. */
export const CHANNEL_COLORS: Record<string, string> = {
  Meta: "#2f6fd6",
  Google: "#d9822b",
  Indeed: "#7b4fc4",
  Organic: "#2e9a6b",
  Untracked: "#9aa5b1",
  Other: "#c2577a",
};
