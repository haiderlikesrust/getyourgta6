/**
 * The site's name lives here and nowhere else.
 * Change these and the logo, page titles, footer and the message wallets
 * sign all follow.
 */
export const BRAND = {
  /** two-part wordmark: plain first part, gradient second part */
  wordmark: ["GTA6", "Fund"] as const,
  name: "GTA6 Fund",
  /** public domain and coin identity */
  domain: "gta6fund.xyz",
  url: "https://gta6fund.xyz",
  coinName: "GTA 6 Fund",
  ticker: "$GTA6FUND",
  /** the project's X (Twitter) account */
  xHandle: "@gta6fundsol",
  xUrl: "https://x.com/gta6fundsol",
  tagline: "Every time the pot can buy a card, somebody gets their GTA 6.",
  description:
    "Connect a wallet and opt in for free, or hold 0.1% of the coin for 10x odds. The pot is checked every 5 minutes, and whenever it can cover a $100 PlayStation or Xbox gift card, one wallet wins it. Unofficial fan project, not affiliated with Rockstar Games.",
} as const;

/** How often the draw check runs. Keep in sync with docker/crontab and vercel.json. */
export const DRAW_INTERVAL_MINUTES = 5;
