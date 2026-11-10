import { NextRequest, NextResponse } from "next/server";
import { config, isValidSolanaAddress } from "@/lib/config";
import { prisma } from "@/lib/db";
import {
  getWalletStanding,
  invalidatePoolSummary,
  verifyEntrySubmission,
} from "@/lib/draw";
import { rateLimit } from "@/lib/rate-limit";

const REASONS: Record<string, string> = {
  expired: "That request expired. Please sign again.",
  bad_challenge: "Invalid entry request. Please try again.",
  bad_signature: "Signature did not match this wallet.",
};

/** Step 2 of opting in: submit the signed message. Idempotent per wallet. */
export async function POST(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "enter-submit",
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      wallet?: string;
      nonce?: string;
      issuedAt?: number;
      mac?: string;
      signature?: string;
    };

    const wallet = body.wallet?.trim() ?? "";
    const nonce = body.nonce ?? "";
    const mac = body.mac ?? "";
    const issuedAt = Number(body.issuedAt);
    const signatureB64 = body.signature ?? "";

    if (
      !wallet ||
      wallet.length > 44 ||
      !isValidSolanaAddress(wallet) ||
      signatureB64.length === 0 ||
      signatureB64.length > 128 ||
      mac.length > 128
    ) {
      return NextResponse.json({ error: "Invalid entry request" }, { status: 400 });
    }

    if (config.excludeAddresses().has(wallet)) {
      return NextResponse.json(
        { error: "This wallet is not eligible for the draw." },
        { status: 403 },
      );
    }

    const verification = verifyEntrySubmission({
      wallet,
      nonce,
      issuedAt,
      mac,
      signature: new Uint8Array(Buffer.from(signatureB64, "base64")),
    });
    if (!verification.ok) {
      return NextResponse.json(
        { error: REASONS[verification.reason] ?? "Invalid entry request" },
        { status: verification.reason === "expired" ? 410 : 401 },
      );
    }

    await prisma.entry.upsert({
      where: { wallet },
      create: { wallet },
      update: {},
    });
    invalidatePoolSummary();

    return NextResponse.json({
      ok: true,
      standing: await getWalletStanding(wallet),
    });
  } catch (error) {
    console.error("Entry submit error:", error);
    return NextResponse.json(
      { error: "Could not save your entry. Please try again." },
      { status: 500 },
    );
  }
}
