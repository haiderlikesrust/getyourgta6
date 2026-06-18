import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { config } from "@/lib/config";
import { runDistribution } from "@/lib/distribute";
import {
  fetchTokenHolders,
  filterEligibleHolders,
  pickRandomHolder,
} from "@/lib/helius";
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
      const holders = await fetchTokenHolders();
      const eligible = filterEligibleHolders(
        holders,
        config.excludeAddresses(),
        config.minHolding(),
      );

      if (eligible.length === 0) {
        return NextResponse.json({
          status: "dry_run",
          reason: "no_eligible_holders",
          totalHolders: holders.length,
          eligibleHolders: 0,
        });
      }

      const winner = pickRandomHolder(eligible);

      return NextResponse.json({
        status: "dry_run",
        totalHolders: holders.length,
        eligibleHolders: eligible.length,
        winner: winner
          ? { wallet: winner.owner, amount: winner.amount }
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
