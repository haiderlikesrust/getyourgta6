import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const SOL_MINT = "So11111111111111111111111111111111111111112";

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
  tokenMint: () => requireEnv("TOKEN_MINT"),
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
  bitrefillPaymentMethod: (): "balance" | "solana" => {
    const explicit = process.env.BITREFILL_PAYMENT_METHOD?.trim().toLowerCase();
    if (explicit === "balance" || explicit === "solana") {
      return explicit;
    }
    return config.bitrefillMode() === "live" ? "solana" : "balance";
  },

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
