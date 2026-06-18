import { NextRequest, NextResponse } from "next/server";
import { config, maskWallet } from "@/lib/config";
import { ensureLedgerState, prisma } from "@/lib/db";
import { getSolUsdPrice, solToUsd } from "@/lib/price";
import { rateLimit } from "@/lib/rate-limit";
import { safeClientError } from "@/lib/security";
import { getRewardKeypair, getRewardWalletBalanceSol } from "@/lib/solana";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "stats",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    await ensureLedgerState();

    const [
      balanceSol,
      price,
      ledger,
      recentRewards,
      totalRewards,
      totalClaimed,
      distributedAgg,
    ] = await Promise.all([
        getRewardWalletBalanceSol().catch(() => 0),
        getSolUsdPrice().catch(() => ({ usdPrice: 0 })),
        prisma.ledgerState.findUnique({ where: { id: "singleton" } }),
        prisma.reward.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            holderWallet: true,
            brand: true,
            amountUsd: true,
            status: true,
            createdAt: true,
          },
        }),
        prisma.reward.count(),
        prisma.reward.count({ where: { status: "CLAIMED" } }),
        prisma.reward.aggregate({
          where: { status: "CLAIMED" },
          _sum: { amountUsd: true },
        }),
      ]);

    const threshold = config.rewardThresholdUsd();
    const testMode = config.testMode();

    let balanceUsd = solToUsd(balanceSol, price.usdPrice);
    const allocatedUsd = ledger?.allocatedUsd ?? 0;
    let availableUsd = Math.max(0, balanceUsd - allocatedUsd);

    if (testMode) {
      balanceUsd = threshold;
      availableUsd = threshold;
    }

    const progressPercent = Math.min(100, (availableUsd / threshold) * 100);

    let rewardWallet: string | null = null;
    try {
      rewardWallet = getRewardKeypair().publicKey.toBase58();
    } catch {
      rewardWallet = null;
    }

    const totalDistributedUsd = distributedAgg._sum.amountUsd ?? 0;

    return NextResponse.json({
      balanceSol,
      balanceUsd,
      allocatedUsd,
      availableUsd,
      threshold,
      progressPercent,
      solPrice: price.usdPrice,
      rewardWallet: rewardWallet ? maskWallet(rewardWallet) : null,
      totalRewards,
      totalClaimed,
      totalDistributedUsd,
      recentWinners: recentRewards.map((r) => ({
        id: r.id,
        wallet: maskWallet(r.holderWallet),
        brand: r.brand,
        amountUsd: r.amountUsd,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      lastRunAt: ledger?.lastRunAt?.toISOString() ?? null,
      testMode,
      testIntervalMs: config.testDistributeIntervalMs(),
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch stats",
        message: safeClientError(error, "Failed to fetch stats"),
      },
      { status: 500 },
    );
  }
}