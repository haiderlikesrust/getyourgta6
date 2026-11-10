import { createHmac, createPublicKey, randomBytes, randomInt, verify } from "crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { timingSafeEqualString } from "./auth";
import { BRAND } from "./brand";
import { config } from "./config";
import { prisma } from "./db";
import { fetchTokenHolders } from "./helius";
import { getConnection } from "./solana";

export type DrawTier = "holder" | "open";

export interface DrawEntrant {
  wallet: string;
  tier: DrawTier;
  /** tickets in the draw */
  weight: number;
  /** raw token amount held (0 for open entries that hold nothing) */
  amount: number;
}

export interface DrawPool {
  entrants: DrawEntrant[];
  totalTickets: number;
  holderEntrants: number;
  openEntrants: number;
  totalHolders: number;
  optIns: number;
  supplyRaw: number;
  thresholdRaw: number;
}

export interface DrawRules {
  boostPercent: number;
  boostMultiplier: number;
  holdersAutoEnter: boolean;
}

export function drawRules(): DrawRules {
  return {
    boostPercent: config.holderBoostPercent(),
    boostMultiplier: config.holderBoostMultiplier(),
    holdersAutoEnter: config.holdersAutoEnter(),
  };
}

// ---------------------------------------------------------------------------
// Supply + balances
// ---------------------------------------------------------------------------

let supplyCache: { raw: number; decimals: number; at: number } | null = null;
const SUPPLY_TTL_MS = 5 * 60 * 1000;

export async function getTokenSupply(): Promise<{ raw: number; decimals: number }> {
  if (supplyCache && Date.now() - supplyCache.at < SUPPLY_TTL_MS) {
    return supplyCache;
  }
  const res = await getConnection().getTokenSupply(
    new PublicKey(config.tokenMint()),
  );
  supplyCache = {
    raw: Number(res.value.amount),
    decimals: res.value.decimals,
    at: Date.now(),
  };
  return supplyCache;
}

export function boostThresholdRaw(supplyRaw: number): number {
  return (supplyRaw * config.holderBoostPercent()) / 100;
}

/** Raw balance of the project token for one wallet (all its token accounts). */
export async function getWalletTokenBalanceRaw(wallet: string): Promise<number> {
  const res = await getConnection().getParsedTokenAccountsByOwner(
    new PublicKey(wallet),
    { mint: new PublicKey(config.tokenMint()) },
  );
  let total = 0;
  for (const { account } of res.value) {
    const amount = (
      account.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } }
    ).parsed?.info?.tokenAmount?.amount;
    if (amount) total += Number(amount);
  }
  return total;
}

/**
 * Program-owned accounts (bonding curve, AMM pools, vaults) show up as "holders"
 * but can never sign a claim. Only real keypair wallets can win.
 */
function isUserWallet(address: string): boolean {
  try {
    return PublicKey.isOnCurve(new PublicKey(address).toBytes());
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

async function filterByMinSol(wallets: string[], minSol: number): Promise<Set<string>> {
  if (minSol <= 0 || wallets.length === 0) return new Set(wallets);
  const minLamports = minSol * config.lamportsPerSol;
  const connection = getConnection();
  const ok = new Set<string>();
  for (let i = 0; i < wallets.length; i += 100) {
    const chunk = wallets.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(
      chunk.map((w) => new PublicKey(w)),
    );
    infos.forEach((info, idx) => {
      if (info && info.lamports >= minLamports) ok.add(chunk[idx]);
    });
  }
  return ok;
}

/**
 * Who is in the draw right now and with how many tickets.
 *  - holds >= boost % of supply  -> `boostMultiplier` tickets (auto-entered unless disabled)
 *  - anyone else who opted in    -> 1 ticket
 */
export async function buildDrawPool(): Promise<DrawPool> {
  const rules = drawRules();
  const exclude = config.excludeAddresses();

  const [holders, supply, optInRows] = await Promise.all([
    fetchTokenHolders(),
    getTokenSupply(),
    prisma.entry.findMany({ select: { wallet: true } }),
  ]);

  const thresholdRaw = boostThresholdRaw(supply.raw);
  const optedIn = new Set(optInRows.map((r) => r.wallet));
  const balances = new Map(holders.map((h) => [h.owner, h.amount]));

  const entrants: DrawEntrant[] = [];
  const seen = new Set<string>();

  for (const holder of holders) {
    if (!holder.owner || exclude.has(holder.owner)) continue;
    if (thresholdRaw <= 0 || holder.amount < thresholdRaw) continue;
    if (!rules.holdersAutoEnter && !optedIn.has(holder.owner)) continue;
    if (!isUserWallet(holder.owner)) continue;
    entrants.push({
      wallet: holder.owner,
      tier: "holder",
      weight: rules.boostMultiplier,
      amount: holder.amount,
    });
    seen.add(holder.owner);
  }

  const openCandidates = Array.from(optedIn).filter(
    (w) => !seen.has(w) && !exclude.has(w) && isUserWallet(w),
  );
  const funded = await filterByMinSol(openCandidates, config.optInMinSol());
  for (const wallet of openCandidates) {
    if (!funded.has(wallet)) continue;
    entrants.push({
      wallet,
      tier: "open",
      weight: 1,
      amount: balances.get(wallet) ?? 0,
    });
  }

  const holderEntrants = entrants.filter((e) => e.tier === "holder").length;

  return {
    entrants,
    totalTickets: entrants.reduce((sum, e) => sum + e.weight, 0),
    holderEntrants,
    openEntrants: entrants.length - holderEntrants,
    totalHolders: holders.length,
    optIns: optedIn.size,
    supplyRaw: supply.raw,
    thresholdRaw,
  };
}

/** Ticket-weighted pick using the OS CSPRNG. */
export function pickWeightedWinner(entrants: DrawEntrant[]): DrawEntrant | null {
  const total = entrants.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return null;
  let ticket = randomInt(total);
  for (const entrant of entrants) {
    if (ticket < entrant.weight) return entrant;
    ticket -= entrant.weight;
  }
  return entrants[entrants.length - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Cached pool summary for the public site
// ---------------------------------------------------------------------------

export interface PoolSummary {
  totalTickets: number;
  holderEntrants: number;
  openEntrants: number;
  optIns: number;
  totalHolders: number | null;
  /** false when the holder snapshot could not be read (shows opt-ins only) */
  live: boolean;
  updatedAt: string;
}

let summaryCache: { value: PoolSummary; at: number } | null = null;
let summaryInFlight: Promise<PoolSummary> | null = null;
const SUMMARY_TTL_MS = 90 * 1000;

async function computePoolSummary(): Promise<PoolSummary> {
  try {
    const pool = await buildDrawPool();
    return {
      totalTickets: pool.totalTickets,
      holderEntrants: pool.holderEntrants,
      openEntrants: pool.openEntrants,
      optIns: pool.optIns,
      totalHolders: pool.totalHolders,
      live: true,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Pool summary fell back to opt-ins only:", error);
    const optIns = await prisma.entry.count().catch(() => 0);
    return {
      totalTickets: optIns,
      holderEntrants: 0,
      openEntrants: optIns,
      optIns,
      totalHolders: null,
      live: false,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function getPoolSummary(force = false): Promise<PoolSummary> {
  if (!force && summaryCache && Date.now() - summaryCache.at < SUMMARY_TTL_MS) {
    return summaryCache.value;
  }
  if (!summaryInFlight) {
    summaryInFlight = computePoolSummary()
      .then((value) => {
        summaryCache = { value, at: Date.now() };
        return value;
      })
      .finally(() => {
        summaryInFlight = null;
      });
  }
  return summaryInFlight;
}

export function invalidatePoolSummary() {
  summaryCache = null;
}

// ---------------------------------------------------------------------------
// One wallet's standing
// ---------------------------------------------------------------------------

export interface WalletStanding {
  wallet: string;
  optedIn: boolean;
  /** in the next draw? */
  entered: boolean;
  tier: DrawTier | null;
  tickets: number;
  /** % of supply held, null if the balance could not be read */
  holdingPercent: number | null;
  boosted: boolean;
  /** tokens (UI units) still needed to reach the boost threshold */
  tokensToBoost: number | null;
  /** chance of winning the next draw, 0..1 (null if pool unknown) */
  odds: number | null;
  totalTickets: number;
  excluded: boolean;
}

export async function getWalletStanding(wallet: string): Promise<WalletStanding> {
  const rules = drawRules();
  const excluded = config.excludeAddresses().has(wallet);

  const [entry, chain, summary] = await Promise.all([
    prisma.entry.findUnique({ where: { wallet } }),
    Promise.all([getWalletTokenBalanceRaw(wallet), getTokenSupply()])
      .then(([balanceRaw, supply]) => ({ balanceRaw, supply }))
      .catch(() => null),
    getPoolSummary(),
  ]);

  const optedIn = !!entry;
  let holdingPercent: number | null = null;
  let boosted = false;
  let tokensToBoost: number | null = null;

  if (chain && chain.supply.raw > 0) {
    const threshold = boostThresholdRaw(chain.supply.raw);
    holdingPercent = (chain.balanceRaw / chain.supply.raw) * 100;
    boosted = threshold > 0 && chain.balanceRaw >= threshold;
    tokensToBoost = boosted
      ? 0
      : Math.ceil((threshold - chain.balanceRaw) / 10 ** chain.supply.decimals);
  }

  let tier: DrawTier | null = null;
  if (!excluded) {
    if (boosted && (rules.holdersAutoEnter || optedIn)) tier = "holder";
    else if (optedIn) tier = "open";
  }

  const tickets = tier === "holder" ? rules.boostMultiplier : tier === "open" ? 1 : 0;

  // The cached pool may predate this wallet's entry; never report odds above 100%.
  const totalTickets = Math.max(summary.totalTickets, tickets);
  const odds = tickets > 0 && totalTickets > 0 ? tickets / totalTickets : tickets > 0 ? 1 : 0;

  return {
    wallet,
    optedIn,
    entered: tier !== null,
    tier,
    tickets,
    holdingPercent,
    boosted,
    tokensToBoost,
    odds: summary.live || tickets > 0 ? odds : null,
    totalTickets,
    excluded,
  };
}

// ---------------------------------------------------------------------------
// Opt-in: stateless signed challenge + ed25519 wallet signature
// ---------------------------------------------------------------------------

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface EntryChallenge {
  wallet: string;
  nonce: string;
  issuedAt: number;
  mac: string;
  message: string;
}

function challengeMac(wallet: string, nonce: string, issuedAt: number): string {
  return createHmac("sha256", `${config.encryptionKey()}:entry-challenge-v1`)
    .update(`${wallet}|${nonce}|${issuedAt}`)
    .digest("base64url");
}

/** The exact text the wallet signs. Rebuilt server-side, never trusted from the client. */
export function entryMessage(wallet: string, nonce: string, issuedAt: number): string {
  return [
    `${BRAND.name} — enter the draw`,
    "",
    "Signing this message proves you own this wallet and opts it in to the gift card draw.",
    "It is free, it is not a transaction, and it cannot move funds.",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(issuedAt).toISOString()}`,
  ].join("\n");
}

export function createEntryChallenge(wallet: string): EntryChallenge {
  const nonce = randomBytes(16).toString("base64url");
  const issuedAt = Date.now();
  return {
    wallet,
    nonce,
    issuedAt,
    mac: challengeMac(wallet, nonce, issuedAt),
    message: entryMessage(wallet, nonce, issuedAt),
  };
}

export function verifyWalletSignature(
  wallet: string,
  message: string,
  signature: Uint8Array,
): boolean {
  try {
    if (signature.length !== 64) return false;
    const rawKey = Buffer.from(bs58.decode(wallet));
    if (rawKey.length !== 32) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(signature));
  } catch {
    return false;
  }
}

export type EntryVerification =
  | { ok: true }
  | { ok: false; reason: "expired" | "bad_challenge" | "bad_signature" };

export function verifyEntrySubmission(input: {
  wallet: string;
  nonce: string;
  issuedAt: number;
  mac: string;
  signature: Uint8Array;
}): EntryVerification {
  const { wallet, nonce, issuedAt, mac, signature } = input;

  if (!Number.isFinite(issuedAt) || nonce.length === 0 || nonce.length > 64) {
    return { ok: false, reason: "bad_challenge" };
  }
  if (!timingSafeEqualString(challengeMac(wallet, nonce, issuedAt), mac)) {
    return { ok: false, reason: "bad_challenge" };
  }
  const age = Date.now() - issuedAt;
  if (age < -60_000 || age > config.entryChallengeTtlMs) {
    return { ok: false, reason: "expired" };
  }
  if (!verifyWalletSignature(wallet, entryMessage(wallet, nonce, issuedAt), signature)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
