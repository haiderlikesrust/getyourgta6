import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { config } from "@/lib/config";
import { runDistribution } from "@/lib/distribute";
import { buildDrawPool, drawRules, pickWeightedWinner } from "@/lib/draw";
import { rateLimit } from "@/lib/rate-limit";
import { safeClientError } from "@/lib/security";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "cron-distribute",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";

  if (dryRun) {
    try {
      const pool = await buildDrawPool();
      const winner = pickWeightedWinner(pool.entrants);

      return NextResponse.json({
        status: "dry_run",
        rules: drawRules(),
        totalHolders: pool.totalHolders,
        optIns: pool.optIns,
        boostedHolders: pool.holderEntrants,
        openEntries: pool.openEntrants,
        totalTickets: pool.totalTickets,
        winner: winner
          ? {
              wallet: winner.wallet,
              tier: winner.tier,
              tickets: winner.weight,
              amount: winner.amount,
            }
          : null,
        note: "No reward created. Remove ?dryRun=true for a real distribution.",
      });
    } catch (error) {
      console.error("Dry run error:", error);
      return NextResponse.json(
        { error: safeClientError(error, "Dry run failed.") },
        { status: 500 },
      );
    }
  }

  try {
    const result = await runDistribution({
      simulateTreasury: config.testMode(),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Cron distribute error:", error);
    return NextResponse.json(
      { error: "Distribution failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
