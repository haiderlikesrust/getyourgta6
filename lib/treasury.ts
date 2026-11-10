import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import { prisma } from "./db";
import { swapExactIn } from "./jupiter";
import { getUsdPrices } from "./price";
import { getPumpCreatorKeypair, sweepCreatorToReward } from "./creator-wallet";
import { getConnection, getLamportsBalance, getRewardKeypair } from "./solana";

export const USDC_DECIMALS = 6;

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export interface MintBalance {
  raw: bigint;
  decimals: number;
  ui: number;
}

/** Balance of any mint (Token or Token-2022) across all of the owner's accounts. */
export async function getMintBalance(
  owner: PublicKey,
  mint: string,
): Promise<MintBalance> {
  const res = await getConnection().getParsedTokenAccountsByOwner(owner, {
    mint: new PublicKey(mint),
  });
  let raw = BigInt(0);
  let decimals = 0;
  for (const { account } of res.value) {
    const tokenAmount = (
      account.data as {
        parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number } } };
      }
    ).parsed?.info?.tokenAmount;
    if (!tokenAmount?.amount) continue;
    raw += BigInt(tokenAmount.amount);
    decimals = tokenAmount.decimals ?? decimals;
  }
  return { raw, decimals, ui: Number(raw) / 10 ** decimals };
}

export interface TreasurySnapshot {
  solBalance: number;
  solPrice: number;
  solUsd: number;
  /** creator rewards not yet swapped, in the reward token */
  pendingTokenBalance: number;
  pendingTokenUsd: number;
  totalUsd: number;
}

/** What the treasury wallet is worth right now, counting un-swapped creator rewards. */
export async function getTreasurySnapshot(): Promise<TreasurySnapshot> {
  const owner = getRewardKeypair().publicKey;
  const rewardMint = config.rewardTokenMint();

  const [lamports, pending, prices] = await Promise.all([
    getLamportsBalance(owner).catch(() => 0),
    getMintBalance(owner, rewardMint).catch(() => null),
    getUsdPrices([config.solMint, rewardMint]).catch(
      () => ({}) as Record<string, number>,
    ),
  ]);

  const solBalance = lamports / LAMPORTS_PER_SOL;
  const solPrice = prices[config.solMint] ?? 0;
  const pendingTokenBalance = pending?.ui ?? 0;
  const pendingTokenUsd = pendingTokenBalance * (prices[rewardMint] ?? 0);
  const solUsd = solBalance * solPrice;

  return {
    solBalance,
    solPrice,
    solUsd,
    pendingTokenBalance,
    pendingTokenUsd,
    totalUsd: solUsd + pendingTokenUsd,
  };
}

let snapshotCache: { value: TreasurySnapshot; at: number } | null = null;
let snapshotInFlight: Promise<TreasurySnapshot> | null = null;

/** Same as getTreasurySnapshot, shared across requests for a few seconds (public stats). */
export async function getTreasurySnapshotCached(
  ttlMs = 10_000,
): Promise<TreasurySnapshot> {
  if (snapshotCache && Date.now() - snapshotCache.at < ttlMs) {
    return snapshotCache.value;
  }
  if (!snapshotInFlight) {
    snapshotInFlight = getTreasurySnapshot()
      .then((value) => {
        snapshotCache = { value, at: Date.now() };
        return value;
      })
      .finally(() => {
        snapshotInFlight = null;
      });
  }
  return snapshotInFlight;
}

/** Append to the public paper trail. Never throws. */
export async function logTreasuryEvent(
  kind: "swap" | "prize_paid" | "fee_claim",
  usdValue: number,
  txSig: string | null,
  detail: Record<string, unknown>,
) {
  try {
    await prisma.treasuryEvent.create({
      data: { kind, usdValue, txSig, detail: JSON.stringify(detail) },
    });
  } catch (error) {
    console.error("Failed to record treasury event:", error);
  }
}

// ---------------------------------------------------------------------------
// Creator rewards -> SOL (Jupiter)
// ---------------------------------------------------------------------------

export interface ConversionResult {
  wallet: string;
  status: "swapped" | "skipped" | "error";
  reason?: string;
  tokenAmount?: number;
  usdValue?: number;
  signature?: string;
  sweepSignature?: string;
}

function treasuryKeypairs(): Keypair[] {
  const reward = getRewardKeypair();
  const out = [reward];
  try {
    const creator = getPumpCreatorKeypair();
    if (!creator.publicKey.equals(reward.publicKey)) out.unshift(creator);
  } catch {
    // creator secret not configured: reward wallet only
  }
  return out;
}

/**
 * Swap any creator-reward tokens sitting in the creator / treasury wallets into SOL,
 * then move the creator wallet's SOL into the treasury.
 */
export async function convertCreatorRewards(): Promise<ConversionResult[]> {
  const rewardMint = config.rewardTokenMint();
  if (!rewardMint || rewardMint === config.solMint) return [];

  const prices = await getUsdPrices([rewardMint]).catch(
    () => ({}) as Record<string, number>,
  );
  const price = prices[rewardMint];
  const reward = getRewardKeypair();
  const results: ConversionResult[] = [];

  for (const keypair of treasuryKeypairs()) {
    const wallet = keypair.publicKey.toBase58();
    try {
      const balance = await getMintBalance(keypair.publicKey, rewardMint);
      if (balance.raw === BigInt(0)) {
        results.push({ wallet, status: "skipped", reason: "no_reward_tokens" });
        continue;
      }

      const usdValue = price ? balance.ui * price : undefined;
      if (usdValue !== undefined && usdValue < config.swapMinUsd()) {
        results.push({
          wallet,
          status: "skipped",
          reason: "below_min_swap_value",
          tokenAmount: balance.ui,
          usdValue,
        });
        continue;
      }

      const swap = await swapExactIn({
        owner: keypair,
        inputMint: rewardMint,
        outputMint: config.solMint,
        amountRaw: balance.raw,
      });

      let sweepSignature: string | undefined;
      if (!keypair.publicKey.equals(reward.publicKey)) {
        sweepSignature = (await sweepCreatorToReward(keypair))?.signature;
      }

      const value = swap.usdValue || usdValue || 0;
      await logTreasuryEvent("swap", value, swap.signature, {
        wallet,
        from: config.rewardTokenSymbol(),
        to: "SOL",
        tokenAmount: balance.ui,
        outLamports: swap.outAmountRaw,
        route: swap.route,
        sweepSignature,
      });

      results.push({
        wallet,
        status: "swapped",
        tokenAmount: balance.ui,
        usdValue: value,
        signature: swap.signature,
        sweepSignature,
      });
    } catch (error) {
      console.error(`Creator reward conversion failed for ${wallet}:`, error);
      results.push({
        wallet,
        status: "error",
        reason: error instanceof Error ? error.message : "conversion_failed",
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Paying for a prize out of the treasury
// ---------------------------------------------------------------------------

/** Record that the money for a reward has left the treasury and release its reservation. */
export async function markRewardFunded(
  rewardId: string,
  txSig: string | null,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const reward = await tx.reward.findUnique({ where: { id: rewardId } });
    if (!reward || reward.fundedAt) return false;

    const updated = await tx.reward.updateMany({
      where: { id: rewardId, fundedAt: null },
      data: { fundedAt: new Date(), fundingTxSig: txSig ?? reward.fundingTxSig },
    });
    if (updated.count === 0) return false;

    if (reward.costUsd > 0) {
      const ledger = await tx.ledgerState.findUnique({ where: { id: "singleton" } });
      if (ledger) {
        await tx.ledgerState.update({
          where: { id: "singleton" },
          data: { allocatedUsd: Math.max(0, ledger.allocatedUsd - reward.costUsd) },
        });
      }
    }
    return true;
  });
}

function assertNotTreasury(payer: Keypair, to: PublicKey) {
  if (to.equals(payer.publicKey)) {
    throw new Error("Refusing to pay the treasury's own address");
  }
}

/** Plain SOL transfer that always leaves the fee reserve behind. */
export async function prepareSolPayment(
  payer: Keypair,
  to: PublicKey,
  lamports: number,
): Promise<Transaction> {
  assertNotTreasury(payer, to);
  const balance = await getLamportsBalance(payer.publicKey);
  const reserve = Math.round(config.feeReserveSol() * LAMPORTS_PER_SOL);
  if (balance - lamports < reserve) {
    throw new Error(
      `Treasury has ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL, needs ${((lamports + reserve) / LAMPORTS_PER_SOL).toFixed(4)} SOL for this payment`,
    );
  }
  return new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: to,
      lamports,
    }),
  );
}

/**
 * USDC (Solana) transfer. Buys any shortfall with treasury SOL on Jupiter first.
 * `to` may be a wallet (paid to its associated token account) or a USDC token account.
 */
export async function prepareUsdcPayment(
  payer: Keypair,
  to: PublicKey,
  amountRaw: bigint,
): Promise<Transaction> {
  assertNotTreasury(payer, to);
  const mint = new PublicKey(config.usdcMint);
  let have = (await getMintBalance(payer.publicKey, config.usdcMint)).raw;

  if (have < amountRaw) {
    const solPrice = (await getUsdPrices([config.solMint]))[config.solMint];
    if (!solPrice) throw new Error("SOL price unavailable");
    // shortfall +1% so slippage cannot leave us a few cents short
    const shortfallUsd = (Number(amountRaw - have) / 10 ** USDC_DECIMALS) * 1.01;
    const lamports = BigInt(Math.ceil((shortfallUsd / solPrice) * LAMPORTS_PER_SOL));
    const balance = BigInt(await getLamportsBalance(payer.publicKey));
    const reserve = BigInt(Math.round(config.feeReserveSol() * LAMPORTS_PER_SOL));
    if (balance - lamports < reserve) {
      throw new Error("Treasury SOL is too low to buy the USDC for this payment");
    }
    const swap = await swapExactIn({
      owner: payer,
      inputMint: config.solMint,
      outputMint: config.usdcMint,
      amountRaw: lamports,
    });
    await logTreasuryEvent("swap", swap.usdValue || shortfallUsd, swap.signature, {
      wallet: payer.publicKey.toBase58(),
      from: "SOL",
      to: "USDC",
      route: swap.route,
    });
    have = (await getMintBalance(payer.publicKey, config.usdcMint)).raw;
    if (have < amountRaw) {
      throw new Error("USDC balance still short after swap; will retry");
    }
  }

  const source = getAssociatedTokenAddressSync(mint, payer.publicKey);
  const tx = new Transaction();

  const info = await getConnection().getAccountInfo(to);
  const isTokenAccount =
    !!info && info.owner.equals(TOKEN_PROGRAM_ID) && info.data.length === 165;

  let destination = to;
  if (isTokenAccount) {
    const accountMint = new PublicKey(info.data.subarray(0, 32));
    if (!accountMint.equals(mint)) {
      throw new Error("Payment address is a token account for a different mint");
    }
  } else {
    destination = getAssociatedTokenAddressSync(mint, to, true);
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        destination,
        to,
        mint,
      ),
    );
  }

  tx.add(
    createTransferCheckedInstruction(
      source,
      mint,
      destination,
      payer.publicKey,
      amountRaw,
      USDC_DECIMALS,
    ),
  );
  return tx;
}

/**
 * Sign, hand the signature to `onSigned` (so it is persisted BEFORE broadcast),
 * then send and confirm. A crash after broadcast can therefore always be
 * reconciled against the chain instead of being paid a second time.
 */
export async function sendTrackedPayment(
  payer: Keypair,
  tx: Transaction,
  onSigned: (signature: string) => Promise<void>,
): Promise<string> {
  const connection = getConnection();
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const signature = bs58.encode(tx.signature!);

  await onSigned(signature);

  await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const confirmation = await connection.confirmTransaction(
    { signature, ...latest },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error(
      `Payment ${signature} failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
    );
  }
  return signature;
}

export type PaymentState = "landed" | "failed" | "unknown";

/** Did a previously broadcast payment actually land? */
export async function getPaymentState(signature: string): Promise<PaymentState> {
  const status = (
    await getConnection().getSignatureStatus(signature, {
      searchTransactionHistory: true,
    })
  ).value;
  if (!status) return "unknown";
  if (status.err) return "failed";
  return status.confirmationStatus === "processed" ? "unknown" : "landed";
}
