import { NextRequest, NextResponse } from "next/server";
import { config, isValidSolanaAddress } from "@/lib/config";
import { createEntryChallenge } from "@/lib/draw";
import { rateLimit } from "@/lib/rate-limit";

/** Step 1 of opting in: get the message the wallet has to sign. */
export async function POST(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "enter-challenge",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const body = (await request.json().catch(() => ({}))) as { wallet?: string };
    const wallet = body.wallet?.trim();

    if (!wallet || wallet.length > 44 || !isValidSolanaAddress(wallet)) {
      return NextResponse.json(
        { error: "Invalid Solana wallet address" },
        { status: 400 },
      );
    }

    const challenge = createEntryChallenge(wallet);
    return NextResponse.json({
      ...challenge,
      expiresAt: new Date(
        challenge.issuedAt + config.entryChallengeTtlMs,
      ).toISOString(),
    });
  } catch (error) {
    console.error("Entry challenge error:", error);
    return NextResponse.json(
      { error: "Could not start the entry. Please try again." },
      { status: 500 },
    );
  }
}
