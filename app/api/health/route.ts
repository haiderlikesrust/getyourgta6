import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { schedulerStatus } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

/**
 * Docker / Swarm health check. During a zero-downtime update the new container
 * must answer 200 here before the old one is stopped. Public, no secrets.
 */
export async function GET() {
  // A lost database fails at once; a slow answer (a long write ahead of us) is not a failure.
  const database = await Promise.race([
    prisma.$queryRawUnsafe("SELECT 1").then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => setTimeout(resolve, 2_000, true)),
  ]);

  return NextResponse.json(
    {
      ok: database,
      database,
      worker: schedulerStatus(),
      build: process.env.NEXT_DEPLOYMENT_ID ?? null,
    },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
