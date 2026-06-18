import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { claimPumpCreatorFees } from "@/lib/pump-fees";
import { rateLimit } from "@/lib/rate-limit";
import { safeClientError } from "@/lib/security";

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

  try {
    const result = await claimPumpCreatorFees();
    const statusCode = result.status === "error" ? 500 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    console.error("Pump fee claim error:", error);
    return NextResponse.json(
      {
        status: "error",
        reason: "claim_transaction_failed",
        message: safeClientError(error, "Claim transaction failed."),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
