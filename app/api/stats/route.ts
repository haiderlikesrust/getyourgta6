import { NextRequest, NextResponse } from "next/server";
import { config, maskWallet } from "@/lib/config";
import { ensureLedgerState, prisma } from "@/lib/db";
import { drawRules, getPoolSummary } from "@/lib/draw";
import { rateLimit } from "@/lib/rate-limit";
import { safeClientError } from "@/lib/security";
import { getRewardKeypair } from "@/lib/solana";
import { getTreasurySnapshotCached } from "@/lib/treasury";

const EMPTY_TREASURY = {
  solBalance: 0,
  solPrice: 0,
  solUsd: 0,
  pendingTokenBalance: 0,
  pendingTokenUsd: 0,
  totalUsd: 0,
};

function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

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
      treasury,
      ledger,
      recentRewards,
      totalRewards,
      totalClaimed,
      distributedAgg,
      pool,
      events,
    ] = await Promise.all([
      getTreasurySnapshotCached().catch(() => EMPTY_TREASURY),
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
          tier: true,
          weight: true,
          poolTickets: true,
          createdAt: true,
        },
      }),
      prisma.reward.count(),
      prisma.reward.count({ where: { status: "CLAIMED" } }),
      prisma.reward.aggregate({
        where: { status: "CLAIMED" },
        _sum: { amountUsd: true },
      }),
      getPoolSummary(),
      prisma.treasuryEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    const prizeUsd = config.rewardThresholdUsd();
    const threshold = config.rewardCostUsd();
    const testMode = config.testMode();

    const feeReserveUsd = config.feeReserveSol() * treasury.solPrice;
    let balanceUsd = Math.max(0, treasury.totalUsd - feeReserveUsd);
    const allocatedUsd = ledger?.allocatedUsd ?? 0;
    let availableUsd = Math.max(0, balanceUsd - allocatedUsd);

    if (testMode) {
      balanceUsd = threshold;
      availableUsd = threshold;
    }

    const progressPercent =
      threshold > 0 ? Math.min(100, (availableUsd / threshold) * 100) : 0;

    let rewardWallet: string | null = null;
    try {
      rewardWallet = getRewardKeypair().publicKey.toBase58();
    } catch {
      rewardWallet = null;
    }

    let tokenMint: string | null = null;
    try {
      tokenMint = config.tokenMint();
    } catch {
      tokenMint = null;
    }

    return NextResponse.json({
      balanceSol: treasury.solBalance,
      balanceUsd,
      allocatedUsd,
      availableUsd,
      prizeUsd,
      threshold,
      progressPercent,
      solPrice: treasury.solPrice,
      pendingTokenBalance: treasury.pendingTokenBalance,
      pendingTokenUsd: treasury.pendingTokenUsd,
      rewardWallet: rewardWallet ? maskWallet(rewardWallet) : null,
      tokenMint,
      totalRewards,
      totalClaimed,
      totalDistributedUsd: distributedAgg._sum.amountUsd ?? 0,
      rules: drawRules(),
      pool,
      brands: config.giftCardBrands(),
      site: {
        symbol: config.tokenSymbol(),
        buyUrl: config.buyUrl(),
        xUrl: config.xUrl(),
        telegramUrl: config.telegramUrl(),
      },
      recentWinners: recentRewards.map((r) => ({
        id: r.id,
        wallet: maskWallet(r.holderWallet),
        brand: r.brand,
        amountUsd: r.amountUsd,
        status: r.status,
        tier: r.tier,
        tickets: r.weight,
        poolTickets: r.poolTickets,
        createdAt: r.createdAt.toISOString(),
      })),
      events: events.map((e) => {
        const detail = safeParse(e.detail);
        return {
          id: e.id,
          kind: e.kind,
          usdValue: e.usdValue,
          txSig: e.txSig,
          from: typeof detail.from === "string" ? detail.from : null,
          to: typeof detail.to === "string" ? detail.to : null,
          asset: typeof detail.asset === "string" ? detail.asset : null,
          createdAt: e.createdAt.toISOString(),
        };
      }),
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
