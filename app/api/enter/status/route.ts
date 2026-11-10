import { NextRequest, NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/config";
import { prisma } from "@/lib/db";
import { drawRules, getWalletStanding } from "@/lib/draw";
import { rateLimit } from "@/lib/rate-limit";

/** Public: is this wallet in the draw, with how many tickets, and has it won? */
export async function GET(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "enter-status",
    limit: 40,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const wallet = request.nextUrl.searchParams.get("wallet")?.trim() ?? "";
  if (!wallet || wallet.length > 44 || !isValidSolanaAddress(wallet)) {
    return NextResponse.json(
      { error: "Invalid Solana wallet address" },
      { status: 400 },
    );
  }

  try {
    const [standing, unclaimed] = await Promise.all([
      getWalletStanding(wallet),
      prisma.reward.count({
        where: { holderWallet: wallet, status: "UNCLAIMED" },
      }),
    ]);
    return NextResponse.json({
      ...standing,
      rules: drawRules(),
      unclaimedRewards: unclaimed,
    });
  } catch (error) {
    console.error("Entry status error:", error);
    return NextResponse.json(
      { error: "Could not load this wallet. Please try again." },
      { status: 500 },
    );
  }
}
