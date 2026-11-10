import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { runTreasuryJob } from "@/lib/jobs";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Manual / external trigger for the treasury job (claim creator rewards, swap
 * to SOL on Jupiter). The in-app scheduler runs the same job every 5 minutes
 * when WORKER_ENABLED=true.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "cron-claim-fees",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTreasuryJob();
  // keep the SOL claim's fields at the top level for older scripts
  return NextResponse.json(
    { ...result.solClaim, ...result, status: result.status },
    { status: result.status === "error" ? 500 : 200 },
  );
}

export async function POST(request: NextRequest) {
  return GET(request);
}
