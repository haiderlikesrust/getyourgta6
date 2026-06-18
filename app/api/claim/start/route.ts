import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  generateClaimToken,
  hashClaimToken,
  verifyClaimToken,
} from "@/lib/auth";
import {
  config,
  formatPlatformLabel,
  isValidPlatform,
  isValidSolanaAddress,
} from "@/lib/config";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { generateTempKeypair, secretToBase58 } from "@/lib/solana";

function genericNotFound() {
  return NextResponse.json(
    { error: "No claimable reward found for this wallet." },
    { status: 404 },
  );
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "claim-start",
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      wallet?: string;
      claimToken?: string;
      platform?: string;
    };
    const wallet = body.wallet?.trim();
    const resumeToken = body.claimToken?.trim();
    const platform = body.platform?.trim().toLowerCase();

    if (!wallet || !isValidSolanaAddress(wallet) || wallet.length > 44) {
      return NextResponse.json(
        { error: "Invalid Solana wallet address" },
        { status: 400 },
      );
    }

    const reward = await prisma.reward.findFirst({
      where: {
        holderWallet: wallet,
        status: "UNCLAIMED",
      },
      orderBy: { createdAt: "asc" },
    });

    if (!reward) {
      return genericNotFound();
    }

    const existingClaim = await prisma.claim.findFirst({
      where: {
        rewardId: reward.id,
        status: { in: ["PENDING", "VERIFIED"] },
        expiresAt: { gt: new Date() },
      },
    });

    if (existingClaim) {
      if (
        resumeToken &&
        verifyClaimToken(resumeToken, existingClaim.claimTokenHash)
      ) {
        return NextResponse.json({
          claimId: existingClaim.id,
          claimToken: resumeToken,
          tempPubkey: existingClaim.tempPubkey,
          verifyAmountSol: config.verifyAmountSol(),
          verifyAmountLamports: Number(existingClaim.verifyAmountLamports),
          expiresAt: existingClaim.expiresAt.toISOString(),
          status: existingClaim.status,
          platform: existingClaim.chosenBrand,
          reward: {
            amountUsd: reward.amountUsd,
            platformLabel: formatPlatformLabel(existingClaim.chosenBrand),
          },
        });
      }

      return genericNotFound();
    }

    if (!platform || !isValidPlatform(platform)) {
      return NextResponse.json(
        {
          error: "Choose a platform: playstation or xbox",
          platforms: config.giftCardBrands(),
        },
        { status: 400 },
      );
    }

    const claimToken = generateClaimToken();
    const tempKeypair = generateTempKeypair();
    const tempSecretEnc = encrypt(
      secretToBase58(tempKeypair),
      config.encryptionKey(),
    );
    const expiresAt = new Date(
      Date.now() + config.claimExpiryMinutes * 60 * 1000,
    );

    try {
      const claim = await prisma.claim.create({
        data: {
          rewardId: reward.id,
          tempPubkey: tempKeypair.publicKey.toBase58(),
          tempSecretEnc,
          claimTokenHash: hashClaimToken(claimToken),
          chosenBrand: platform,
          verifyAmountLamports: BigInt(config.verifyAmountLamports()),
          status: "PENDING",
          activeRewardKey: reward.id,
          expiresAt,
        },
      });

      return NextResponse.json({
        claimId: claim.id,
        claimToken,
        tempPubkey: claim.tempPubkey,
        verifyAmountSol: config.verifyAmountSol(),
        verifyAmountLamports: Number(claim.verifyAmountLamports),
        expiresAt: claim.expiresAt.toISOString(),
        status: claim.status,
        platform,
        reward: {
          amountUsd: reward.amountUsd,
          platformLabel: formatPlatformLabel(platform),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return genericNotFound();
      }
      throw error;
    }
  } catch (error) {
    console.error("Claim start error:", error);
    return NextResponse.json(
      { error: "Failed to start claim. Please try again later." },
      { status: 500 },
    );
  }
}
