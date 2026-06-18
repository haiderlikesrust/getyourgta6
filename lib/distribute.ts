import { config } from "./config";
import { ensureLedgerState, prisma } from "./db";
import {
  fetchTokenHolders,
  filterEligibleHolders,
  pickRandomHolder,
} from "./helius";
import { getSolUsdPrice, solToUsd } from "./price";
import { getRewardWalletBalanceSol } from "./solana";

const LOCK_STALE_MS = 10 * 60 * 1000;

export interface DistributionResult {
  status: "distributed" | "skipped";
  reason?: string;
  rewardId?: string;
  holderWallet?: string;
  amountUsd?: number;
  totalHolders?: number;
  eligibleHolders?: number;
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
  const threshold = config.rewardThresholdUsd();

  await ensureLedgerState();

  const lockHeld = await acquireCronLock();
  if (!lockHeld) {
    return { status: "skipped", reason: "cron_already_running" };
  }

  try {
    const price = await getSolUsdPrice().catch(() => ({ usdPrice: 0 }));
    const ledger = await prisma.ledgerState.findUniqueOrThrow({
      where: { id: "singleton" },
    });

    let balanceUsd: number;
    let availableUsd: number;

    if (simulateTreasury) {
      balanceUsd = threshold;
      availableUsd = threshold;
    } else {
      const balanceSol = await getRewardWalletBalanceSol();
      balanceUsd = solToUsd(balanceSol, price.usdPrice);
      availableUsd = balanceUsd - ledger.allocatedUsd;

      if (availableUsd < threshold) {
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
          threshold,
        };
      }
    }

    const holders = await fetchTokenHolders();
    const eligible = filterEligibleHolders(
      holders,
      config.excludeAddresses(),
      config.minHolding(),
    );

    if (eligible.length === 0) {
      return {
        status: "skipped",
        reason: "no_eligible_holders",
        totalHolders: holders.length,
        eligibleHolders: 0,
        testMode: simulateTreasury,
      };
    }

    const winner = pickRandomHolder(eligible);
    if (!winner) {
      return { status: "skipped", reason: "no_winner_selected" };
    }

    if (!simulateTreasury) {
      const reserved = await prisma.$transaction(async (tx) => {
        const current = await tx.ledgerState.findUniqueOrThrow({
          where: { id: "singleton" },
        });
        const freshAvailable = balanceUsd - current.allocatedUsd;
        if (freshAvailable < threshold) return null;
        await tx.ledgerState.update({
          where: { id: "singleton" },
          data: {
            allocatedUsd: { increment: threshold },
            lastRunAt: new Date(),
          },
        });
        return current;
      });

      if (!reserved) {
        return {
          status: "skipped",
          reason: "insufficient_available_balance_race",
        };
      }
    } else {
      await prisma.ledgerState.update({
        where: { id: "singleton" },
        data: { lastRunAt: new Date() },
      });
    }

    const reward = await prisma.reward.create({
      data: {
        holderWallet: winner.owner,
        brand: "pending",
        amountUsd: threshold,
        status: "UNCLAIMED",
      },
    });

    await prisma.holderSnapshot.create({
      data: {
        holderCount: eligible.length,
        json: JSON.stringify({
          totalHolders: holders.length,
          eligibleCount: eligible.length,
          winner: winner.owner,
          solPrice: price.usdPrice,
          balanceUsd,
          testMode: simulateTreasury,
        }),
      },
    });

    const updatedLedger = await prisma.ledgerState.findUniqueOrThrow({
      where: { id: "singleton" },
    });

    return {
      status: "distributed",
      rewardId: reward.id,
      holderWallet: winner.owner,
      amountUsd: threshold,
      totalHolders: holders.length,
      eligibleHolders: eligible.length,
      balanceUsd: simulateTreasury ? threshold : balanceUsd,
      allocatedUsd: updatedLedger.allocatedUsd,
      availableUsd: simulateTreasury
        ? threshold
        : Math.max(0, balanceUsd - updatedLedger.allocatedUsd),
      threshold,
      testMode: simulateTreasury,
    };
  } finally {
    await releaseCronLock();
  }
}
