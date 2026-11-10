import { config } from "./config";
import { ensureLedgerState, prisma } from "./db";
import { buildDrawPool, invalidatePoolSummary, pickWeightedWinner } from "./draw";
import { getSolUsdPrice, solToUsd } from "./price";
import { getRewardWalletBalanceSol } from "./solana";
import { convertCreatorRewards } from "./treasury";

const LOCK_STALE_MS = 10 * 60 * 1000;

export interface DistributionResult {
  status: "distributed" | "skipped";
  reason?: string;
  rewardId?: string;
  holderWallet?: string;
  winnerTier?: string;
  winnerTickets?: number;
  totalTickets?: number;
  amountUsd?: number;
  costUsd?: number;
  totalHolders?: number;
  /** wallets in the draw (boosted holders + open entries) */
  eligibleHolders?: number;
  boostedHolders?: number;
  openEntries?: number;
  balanceUsd?: number;
  allocatedUsd?: number;
  availableUsd?: number;
  threshold?: number;
  testMode?: boolean;
}

async function acquireCronLock(): Promise<boolean> {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  const result = await prisma.ledgerState.updateMany({
    where: {
      id: "singleton",
      OR: [
        { isProcessing: false },
        { processingStartedAt: { lt: staleBefore } },
        { processingStartedAt: null },
      ],
    },
    data: {
      isProcessing: true,
      processingStartedAt: new Date(),
    },
  });
  return result.count === 1;
}

async function releaseCronLock() {
  await prisma.ledgerState.update({
    where: { id: "singleton" },
    data: { isProcessing: false, processingStartedAt: null },
  });
}

export async function runDistribution(
  options: { simulateTreasury?: boolean } = {},
): Promise<DistributionResult> {
  const simulateTreasury = options.simulateTreasury ?? config.testMode();
  /** gift card face value */
  const prizeUsd = config.rewardThresholdUsd();
  /** what the treasury must hold to pay for it (face value + buffer) */
  const costUsd = config.rewardCostUsd();

  await ensureLedgerState();

  const lockHeld = await acquireCronLock();
  if (!lockHeld) {
    return { status: "skipped", reason: "cron_already_running" };
  }

  try {
    if (!simulateTreasury) {
      // Turn any creator rewards into SOL before counting the pot.
      await convertCreatorRewards().catch((error) =>
        console.error("Pre-draw conversion failed:", error),
      );
    }

    const price = await getSolUsdPrice().catch(() => ({ usdPrice: 0 }));
    const ledger = await prisma.ledgerState.findUniqueOrThrow({
      where: { id: "singleton" },
    });

    let balanceUsd: number;
    let availableUsd: number;

    if (simulateTreasury) {
      balanceUsd = costUsd;
      availableUsd = costUsd;
    } else {
      const balanceSol = await getRewardWalletBalanceSol();
      const spendableSol = Math.max(0, balanceSol - config.feeReserveSol());
      balanceUsd = solToUsd(spendableSol, price.usdPrice);
      availableUsd = balanceUsd - ledger.allocatedUsd;

      if (availableUsd < costUsd) {
        await prisma.ledgerState.update({
          where: { id: "singleton" },
          data: { lastRunAt: new Date() },
        });
        return {
          status: "skipped",
          reason: "insufficient_available_balance",
          balanceUsd,
          allocatedUsd: ledger.allocatedUsd,
          availableUsd,
          threshold: costUsd,
        };
      }
    }

    const pool = await buildDrawPool();

    if (pool.entrants.length === 0) {
      return {
        status: "skipped",
        reason: "no_entrants",
        totalHolders: pool.totalHolders,
        eligibleHolders: 0,
        testMode: simulateTreasury,
      };
    }

    const winner = pickWeightedWinner(pool.entrants);
    if (!winner) {
      return { status: "skipped", reason: "no_winner_selected" };
    }

    // Reserve the money and record the winner in ONE transaction: if the server
    // is stopped mid-draw (an update, a crash) the pot can never end up with a
    // reservation that has no winner, or a winner with nothing reserved.
    const reward = await prisma.$transaction(async (tx) => {
      if (!simulateTreasury) {
        const current = await tx.ledgerState.findUniqueOrThrow({
          where: { id: "singleton" },
        });
        const freshAvailable = balanceUsd - current.allocatedUsd;
        if (freshAvailable < costUsd) return null;
        await tx.ledgerState.update({
          where: { id: "singleton" },
          data: {
            allocatedUsd: { increment: costUsd },
            lastRunAt: new Date(),
          },
        });
      } else {
        await tx.ledgerState.update({
          where: { id: "singleton" },
          data: { lastRunAt: new Date() },
        });
      }

      return tx.reward.create({
        data: {
          holderWallet: winner.wallet,
          brand: "pending",
          amountUsd: prizeUsd,
          costUsd: simulateTreasury ? 0 : costUsd,
          tier: winner.tier,
          weight: winner.weight,
          poolTickets: pool.totalTickets,
          status: "UNCLAIMED",
        },
      });
    });

    if (!reward) {
      return {
        status: "skipped",
        reason: "insufficient_available_balance_race",
      };
    }

    await prisma.holderSnapshot.create({
      data: {
        holderCount: pool.entrants.length,
        json: JSON.stringify({
          totalHolders: pool.totalHolders,
          entrants: pool.entrants.length,
          boostedHolders: pool.holderEntrants,
          openEntries: pool.openEntrants,
          totalTickets: pool.totalTickets,
          boostPercent: config.holderBoostPercent(),
          boostMultiplier: config.holderBoostMultiplier(),
          winner: winner.wallet,
          winnerTier: winner.tier,
          winnerTickets: winner.weight,
          solPrice: price.usdPrice,
          balanceUsd,
          testMode: simulateTreasury,
        }),
      },
    });

    invalidatePoolSummary();

    const updatedLedger = await prisma.ledgerState.findUniqueOrThrow({
      where: { id: "singleton" },
    });

    return {
      status: "distributed",
      rewardId: reward.id,
      holderWallet: winner.wallet,
      winnerTier: winner.tier,
      winnerTickets: winner.weight,
      totalTickets: pool.totalTickets,
      amountUsd: prizeUsd,
      costUsd,
      totalHolders: pool.totalHolders,
      eligibleHolders: pool.entrants.length,
      boostedHolders: pool.holderEntrants,
      openEntries: pool.openEntrants,
      balanceUsd: simulateTreasury ? costUsd : balanceUsd,
      allocatedUsd: updatedLedger.allocatedUsd,
      availableUsd: simulateTreasury
        ? costUsd
        : Math.max(0, balanceUsd - costUsd - ledger.allocatedUsd),
      threshold: costUsd,
      testMode: simulateTreasury,
    };
  } finally {
    await releaseCronLock();
  }
}
