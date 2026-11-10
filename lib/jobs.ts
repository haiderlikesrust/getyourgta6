import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import {
  claimCreatorRewardToken,
  claimPumpCreatorFees,
  type PumpFeeClaimResult,
  type TokenFeeClaimResult,
} from "./pump-fees";
import { safeClientError } from "./security";
import { convertCreatorRewards, type ConversionResult } from "./treasury";

/**
 * Run `fn` only if no other process holds the named lease. The lease expires on
 * its own after `ttlMs`, so a killed container can never block the job forever.
 * Returns null when someone else is running it.
 */
export async function withJobLock<T>(
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const now = new Date();
  const until = new Date(now.getTime() + ttlMs);

  // Take a free (or expired) lease atomically.
  const taken = await prisma.jobLock.updateMany({
    where: { name, lockedUntil: { lt: now } },
    data: { lockedUntil: until },
  });
  let acquired = taken.count === 1;

  if (!acquired) {
    const existing = await prisma.jobLock.findUnique({ where: { name } });
    if (existing) return null; // someone else holds it

    // First run ever: create the row. Losing that race means the other process has it.
    try {
      await prisma.jobLock.create({ data: { name, lockedUntil: until } });
      acquired = true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return null;
      }
      throw error;
    }
  }

  try {
    return await fn();
  } finally {
    await prisma.jobLock
      .updateMany({ where: { name }, data: { lockedUntil: new Date(0) } })
      .catch(() => {});
  }
}

type StepError = { status: "error"; reason: string; message: string };

export interface TreasuryJobResult {
  status: "ok" | "error" | "skipped";
  reason?: string;
  solClaim?: PumpFeeClaimResult | StepError;
  tokenClaim?: TokenFeeClaimResult | StepError;
  conversions?: Array<ConversionResult | StepError>;
}

/**
 * Collect creator rewards (SOL vault + reward-token vault), then swap the reward
 * token to SOL on Jupiter and sweep it into the treasury. Each step is
 * independent: one failing never blocks the others.
 */
export async function runTreasuryJob(): Promise<TreasuryJobResult> {
  const result = await withJobLock("treasury", 4 * 60_000, async () => {
    const fail = (reason: string) => (error: unknown): StepError => {
      console.error(`${reason}:`, error);
      return { status: "error", reason, message: safeClientError(error, reason) };
    };

    const solClaim = await claimPumpCreatorFees().catch(
      fail("claim_transaction_failed"),
    );
    const tokenClaim = await claimCreatorRewardToken().catch(
      fail("token_claim_failed"),
    );
    const conversions = await convertCreatorRewards().catch((error) => [
      fail("conversion_failed")(error),
    ]);

    const anyError =
      solClaim.status === "error" ||
      tokenClaim.status === "error" ||
      conversions.some((c) => c.status === "error");

    return {
      status: anyError ? ("error" as const) : ("ok" as const),
      solClaim,
      tokenClaim,
      conversions,
    };
  });

  return result ?? { status: "skipped", reason: "treasury_job_already_running" };
}
