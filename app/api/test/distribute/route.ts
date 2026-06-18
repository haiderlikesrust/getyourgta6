import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { config } from "@/lib/config";
import { runDistribution } from "@/lib/distribute";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  if (!config.testMode()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const limited = rateLimit(request, {
    key: "test-distribute",
    limit: 12,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (!authorizeCron(request) && process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDistribution({ simulateTreasury: true });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Test distribute error:", error);
    return NextResponse.json(
      { error: "Test distribution failed." },
      { status: 500 },
    );
  }
}
