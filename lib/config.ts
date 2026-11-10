import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { BRAND } from "./brand";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** Take-Two Interactive (TTWO) tokenized stock, Token-2022, 6 decimals */
const DEFAULT_REWARD_TOKEN_MINT = "TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(name: string): string[] {
  const raw = process.env[name];
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  heliusApiKey: () => process.env.HELIUS_API_KEY ?? "",
  /**
   * The coin's contract address: shown on the site and used for the draw.
   * Set it as `CA` in .env (the older name TOKEN_MINT still works).
   */
  tokenMint: () => {
    const value = process.env.CA?.trim() || process.env.TOKEN_MINT?.trim();
    if (!value) {
      throw new Error("Missing required environment variable: CA");
    }
    return value;
  },
  /** the CA only if it is a real Solana address (null while unset or a placeholder) */
  contractAddress: (): string | null => {
    const value = process.env.CA?.trim() || process.env.TOKEN_MINT?.trim();
    return value && isValidSolanaAddress(value) ? value : null;
  },
  solanaRpcUrl: () =>
    optionalEnv(
      "SOLANA_RPC_URL",
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY ?? ""}`,
    ),
  rewardWalletSecret: () => requireEnv("REWARD_WALLET_SECRET"),
  cronSecret: () => requireEnv("CRON_SECRET"),
  encryptionKey: () => requireEnv("ENCRYPTION_KEY"),
  rewardThresholdUsd: () => parseFloatEnv("REWARD_THRESHOLD_USD", 100),
  verifyAmountSol: () => parseFloatEnv("VERIFY_AMOUNT_SOL", 0.01),
  minHolding: () => parseFloatEnv("MIN_HOLDING", 1),
  excludeAddresses: () => {
    const list = parseList("EXCLUDE_ADDRESSES");
    try {
      const rewardSecret = process.env.REWARD_WALLET_SECRET;
      if (rewardSecret && rewardSecret !== "placeholder") {
        const kp = Keypair.fromSecretKey(bs58.decode(rewardSecret));
        list.push(kp.publicKey.toBase58());
      }
    } catch {
      // ignore invalid key during build or misconfigured env
    }
    return new Set(list);
  },
  giftCardBrands: () => {
    const brands = parseList("GIFT_CARD_BRANDS");
    return brands.length > 0 ? brands : ["playstation", "xbox"];
  },
  jupApiKey: () => process.env.JUP_API_KEY,

  // ---------- Bitrefill ----------
  bitrefillBaseUrl: () =>
    optionalEnv("BITREFILL_BASE_URL", "https://api.bitrefill.com/v2"),
  bitrefillApiKey: () => process.env.BITREFILL_API_KEY,
  bitrefillApiId: () => process.env.BITREFILL_API_ID,
  bitrefillApiSecret: () => process.env.BITREFILL_API_SECRET,
  /**
   * Mode resolution:
   * - explicit BITREFILL_MODE wins (mock | test | live)
   * - else: no credentials -> mock; credentials present -> test (safe default)
   */
  bitrefillMode: (): "mock" | "test" | "live" => {
    const explicit = process.env.BITREFILL_MODE?.trim().toLowerCase();
    if (explicit === "mock" || explicit === "test" || explicit === "live") {
      return explicit;
    }
    const hasCreds =
      !!process.env.BITREFILL_API_KEY ||
      (!!process.env.BITREFILL_API_ID && !!process.env.BITREFILL_API_SECRET);
    return hasCreds ? "test" : "mock";
  },
  /** brand -> live Bitrefill product id */
  bitrefillProductId: (brand: string): string | undefined => {
    const key = `BITREFILL_PRODUCT_${brand.toUpperCase()}`;
    return process.env[key]?.trim() || undefined;
  },
  /** test product used in `test` mode */
  bitrefillTestProductId: () =>
    optionalEnv("BITREFILL_TEST_PRODUCT", "test-gift-card-code"),
  /**
   * How live gift cards are paid:
   * - balance: pre-funded Bitrefill USD balance (auto_pay)
   * - solana: pay per claim from REWARD_WALLET_SECRET (default for live)
   */
  bitrefillPaymentMethod: (): "balance" | "solana" | "usdc_solana" => {
    const explicit = process.env.BITREFILL_PAYMENT_METHOD?.trim().toLowerCase();
    if (
      explicit === "balance" ||
      explicit === "solana" ||
      explicit === "usdc_solana"
    ) {
      return explicit;
    }
    return config.bitrefillMode() === "live" ? "solana" : "balance";
  },

  // ---------- Draw: open entries + boosted holders ----------
  /** % of total supply a wallet must hold to get boosted odds */
  holderBoostPercent: () =>
    Math.max(0, parseFloatEnv("HOLDER_BOOST_PERCENT", 0.1)),
  /** tickets a boosted holder gets (an open entry is always 1 ticket) */
  holderBoostMultiplier: () =>
    Math.max(1, Math.round(parseFloatEnv("HOLDER_BOOST_MULTIPLIER", 10))),
  /** true: qualifying holders are in every draw without opting in */
  holdersAutoEnter: () =>
    (process.env.HOLDERS_AUTO_ENTER ?? "true").trim().toLowerCase() !== "false",
  /** anti-sybil: opted-in wallets below this SOL balance are skipped at draw time */
  optInMinSol: () => Math.max(0, parseFloatEnv("OPT_IN_MIN_SOL", 0)),
  entryChallengeTtlMs: 10 * 60 * 1000,

  // ---------- Treasury: creator rewards arrive as a token, swapped on Jupiter ----------
  /** mint the creator rewards are paid in (default: TTWO tokenized stock) */
  rewardTokenMint: () =>
    optionalEnv("REWARD_TOKEN_MINT", DEFAULT_REWARD_TOKEN_MINT).trim(),
  usdcMint: USDC_MINT,
  jupSwapBaseUrl: () =>
    optionalEnv("JUP_SWAP_BASE_URL", "https://api.jup.ag/swap/v1").replace(
      /\/+$/,
      "",
    ),
  swapSlippageBps: () =>
    Math.min(1000, Math.max(1, Math.round(parseFloatEnv("SWAP_SLIPPAGE_BPS", 100)))),
  /** refuse a swap whose quoted price impact is above this (percent) */
  swapMaxPriceImpactPercent: () =>
    parseFloatEnv("SWAP_MAX_PRICE_IMPACT_PERCENT", 3),
  /** don't bother swapping dust below this USD value */
  swapMinUsd: () => Math.max(0, parseFloatEnv("SWAP_MIN_USD", 5)),
  /** SOL always left in the treasury wallet for network fees */
  feeReserveSol: () => Math.max(0, parseFloatEnv("FEE_RESERVE_SOL", 0.02)),

  // ---------- Prize cost ----------
  /**
   * % on top of the card's face value that it really costs to buy one
   * (provider markup, price moves between draw and purchase, network fees).
   * Set it to what your provider actually charges for the card.
   */
  prizeBufferPercent: () =>
    Math.max(0, parseFloatEnv("PRIZE_BUFFER_PERCENT", 3)),
  /** what the pot must hold before a draw: enough to actually buy the card */
  rewardCostUsd: () => {
    const base = parseFloatEnv("REWARD_THRESHOLD_USD", 100);
    const buffer = Math.max(0, parseFloatEnv("PRIZE_BUFFER_PERCENT", 3));
    return Math.round(base * (1 + buffer / 100) * 100) / 100;
  },

  // ---------- Public site info ----------
  /** ticker shown on the site, e.g. "$GTA6" (optional) */
  tokenSymbol: (): string | null => {
    // written without the "$" in .env, because env loaders expand "$NAME"
    const raw = process.env.TOKEN_SYMBOL?.trim().replace(/^\$+/, "");
    return raw ? `$${raw}` : BRAND.ticker;
  },
  /** where "get the coin" points: the coin's pump.fun page, built from the CA */
  buyUrl: (): string | null => {
    const ca = config.contractAddress();
    return ca ? `https://pump.fun/coin/${ca}` : null;
  },
  /** short name for the creator-reward token in the public paper trail */
  rewardTokenSymbol: () => optionalEnv("REWARD_TOKEN_SYMBOL", "TTWO").trim(),

  claimExpiryMinutes: 30,
  solMint: SOL_MINT,
  lamportsPerSol: 1_000_000_000,
  verifyAmountLamports: () =>
    Math.round(parseFloatEnv("VERIFY_AMOUNT_SOL", 0.01) * 1_000_000_000),

  // ---------- Pump.fun creator fees ----------
  /** Creator wallet for fee claims; defaults to bonding-curve creator for TOKEN_MINT */
  pumpCreatorWallet: () => process.env.PUMP_CREATOR_WALLET?.trim() || undefined,
  /** Secret for the creator wallet; defaults to REWARD_WALLET_SECRET */
  pumpCreatorWalletSecret: () =>
    process.env.PUMP_CREATOR_WALLET_SECRET?.trim() ||
    requireEnv("REWARD_WALLET_SECRET"),
  /** Min vault balance (lamports) before attempting a claim */
  pumpMinClaimLamports: () =>
    Math.round(parseFloatEnv("PUMP_MIN_CLAIM_LAMPORTS", 10_000)),
  pumpClaimFeesIntervalMs: () =>
    parseFloatEnv("PUMP_CLAIM_FEES_INTERVAL_MS", 600_000),

  // ---------- Test mode (dev only — never enabled in production) ----------
  testMode: () => {
    if (process.env.NODE_ENV === "production") return false;
    return process.env.TEST_MODE === "true";
  },
  testDistributeIntervalMs: () =>
    parseFloatEnv("TEST_DISTRIBUTE_INTERVAL_MS", 10_000),
};

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function maskWallet(wallet: string): string {
  if (wallet.length <= 10) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

export type GiftCardPlatform = "playstation" | "xbox";

export function isValidPlatform(value: string): value is GiftCardPlatform {
  return config.giftCardBrands().includes(value as GiftCardPlatform);
}

export function formatPlatformLabel(brand: string): string {
  if (brand === "playstation") return "PlayStation";
  if (brand === "xbox") return "Xbox";
  if (brand === "pending") return "Your Choice";
  return brand;
}
