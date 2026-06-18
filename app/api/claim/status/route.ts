import { NextRequest, NextResponse } from "next/server";
import { verifyClaimToken } from "@/lib/auth";
import { purchaseGiftCard } from "@/lib/bitrefill";
import { config, formatPlatformLabel } from "@/lib/config";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  extractClaimAuth,
  isValidClaimId,
  isValidClaimToken,
  parseClaimAuthBody,
} from "@/lib/security";
import {
  findIncomingTransfer,
  keypairFromSecret,
  refundFromRewardWallet,
  refundVerification,
  sweepTempWalletToReward,
} from "@/lib/solana";
import type { Claim, Reward } from "@prisma/client";

interface GiftCardDetails {
  code?: string;
  pin?: string;
  link?: string;
  instructions?: string;
  orderId: string;
}

type ClaimWithReward = Claim & { reward: Reward };

async function handleClaimStatus(
  request: NextRequest,
  claimId: string | null,
  claimToken: string | null,
) {
  if (!claimId || !claimToken) {
    return NextResponse.json(
      { error: "claimId and claimToken are required" },
      { status: 400 },
    );
  }

  if (!isValidClaimId(claimId) || !isValidClaimToken(claimToken)) {
    return NextResponse.json({ error: "Invalid claim session" }, { status: 403 });
  }

  try {
    let claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: { reward: true },
    });

    if (!claim || !verifyClaimToken(claimToken, claim.claimTokenHash)) {
      return NextResponse.json({ error: "Invalid claim session" }, { status: 403 });
    }

    if (claim.expiresAt < new Date() && claim.status === "PENDING") {
      await prisma.claim.updateMany({
        where: { id: claimId, status: "PENDING" },
        data: { status: "EXPIRED", activeRewardKey: null },
      });
      return NextResponse.json({
        status: "EXPIRED",
        message: "Claim expired. Please start a new claim.",
      });
    }

    if (claim.status === "REFUNDED" && claim.reward.status === "CLAIMED") {
      return completeResponse(claim);
    }

    if (claim.status === "PENDING") {
      const minLamports = Number(claim.verifyAmountLamports);
      const maxLamports = minLamports + 50_000;

      const incoming = await findIncomingTransfer(
        claim.tempPubkey,
        claim.reward.holderWallet,
        minLamports,
        maxLamports,
      );

      if (!incoming) {
        return NextResponse.json({
          status: "PENDING",
          tempPubkey: claim.tempPubkey,
          verifyAmountSol: config.verifyAmountSol(),
          platform: claim.chosenBrand,
          platformLabel: formatPlatformLabel(claim.chosenBrand),
          message: `Send ${config.verifyAmountSol()} SOL from your winning wallet to verify ownership.`,
        });
      }

      const existingByTx = await prisma.claim.findUnique({
        where: { verifiedTxSig: incoming.signature },
      });
      if (existingByTx && existingByTx.id !== claimId) {
        return NextResponse.json(
          { status: "ERROR", message: "Verification transaction already used." },
          { status: 409 },
        );
      }

      const locked = await prisma.claim.updateMany({
        where: { id: claimId, status: "PENDING" },
        data: { status: "VERIFIED", verifiedTxSig: incoming.signature },
      });

      if (locked.count === 0) {
        claim = await prisma.claim.findUniqueOrThrow({
          where: { id: claimId },
          include: { reward: true },
        });
        if (claim.status === "REFUNDED" && claim.reward.status === "CLAIMED") {
          return completeResponse(claim);
        }
        if (claim.status === "VERIFIED") {
          return fulfillClaim(claim);
        }
        return NextResponse.json({
          status: claim.status,
          message: "Claim is being processed.",
        });
      }

      claim = await prisma.claim.findUniqueOrThrow({
        where: { id: claimId },
        include: { reward: true },
      });
    }

    if (claim.status === "VERIFIED") {
      return fulfillClaim(claim);
    }

    return NextResponse.json({
      status: claim.status,
      message: "Claim is being processed.",
    });
  } catch (error) {
    console.error("Claim status error:", error);
    return NextResponse.json(
      { error: "Failed to check claim status. Please try again later." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "claim-status",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { claimId, claimToken } = await parseClaimAuthBody(request);
  return handleClaimStatus(request, claimId, claimToken);
}

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "claim-status",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { claimId, claimToken } = extractClaimAuth(request);
  return handleClaimStatus(request, claimId, claimToken);
}

async function acquirePurchaseLock(
  claimId: string,
  rewardId: string,
): Promise<boolean> {
  const result = await prisma.reward.updateMany({
    where: {
      id: rewardId,
      status: "UNCLAIMED",
      purchaseClaimId: null,
      giftCardCodeEnc: null,
    },
    data: { purchaseClaimId: claimId },
  });
  return result.count === 1;
}

async function releasePurchaseLock(claimId: string, rewardId: string) {
  await prisma.reward.updateMany({
    where: {
      id: rewardId,
      purchaseClaimId: claimId,
      giftCardCodeEnc: null,
      status: "UNCLAIMED",
    },
    data: { purchaseClaimId: null },
  });
}

async function fulfillClaim(claim: ClaimWithReward) {
  const tempSecret = decrypt(claim.tempSecretEnc, config.encryptionKey());
  const tempKeypair = keypairFromSecret(tempSecret);

  let reward = await prisma.reward.findUniqueOrThrow({
    where: { id: claim.rewardId },
  });

  if (!reward.giftCardCodeEnc) {
    const ownsLock =
      reward.purchaseClaimId === claim.id ||
      (await acquirePurchaseLock(claim.id, claim.rewardId));

    if (!ownsLock) {
      reward = await prisma.reward.findUniqueOrThrow({
        where: { id: claim.rewardId },
      });
      if (!reward.giftCardCodeEnc) {
        return NextResponse.json({
          status: "VERIFIED",
          message: "Gift card purchase in progress. Please wait.",
        });
      }
    } else {
      try {
        const purchase = await purchaseGiftCard(
          claim.reward.amountUsd,
          claim.chosenBrand,
        );
        const giftCardCodeEnc = encrypt(
          JSON.stringify({
            code: purchase.code,
            pin: purchase.pin,
            link: purchase.link,
            instructions: purchase.instructions,
            orderId: purchase.orderId,
            invoiceId: purchase.invoiceId,
            productId: purchase.productId,
            paymentTxSig: purchase.paymentTxSig,
          }),
          config.encryptionKey(),
        );

        const stored = await prisma.reward.updateMany({
          where: {
            id: claim.rewardId,
            purchaseClaimId: claim.id,
            giftCardCodeEnc: null,
          },
          data: {
            brand: claim.chosenBrand,
            giftCardCodeEnc,
          },
        });

        if (stored.count === 0) {
          reward = await prisma.reward.findUniqueOrThrow({
            where: { id: claim.rewardId },
          });
        } else {
          reward = await prisma.reward.findUniqueOrThrow({
            where: { id: claim.rewardId },
          });
        }
      } catch (purchaseError) {
        await releasePurchaseLock(claim.id, claim.rewardId);
        console.error("Gift card purchase failed:", purchaseError);
        return NextResponse.json(
          {
            status: "ERROR",
            message:
              "Wallet verified but gift card purchase failed. Please try again shortly.",
          },
          { status: 500 },
        );
      }
    }
  }

  let refundTxSig = claim.refundTxSig ?? undefined;
  if (!refundTxSig) {
    const incomingLamports = Number(claim.verifyAmountLamports);
    try {
      const refund = await refundVerification(
        tempKeypair,
        claim.reward.holderWallet,
        incomingLamports,
      );
      refundTxSig = refund.signature;
    } catch (refundError) {
      console.error("Temp refund failed, trying reward wallet:", refundError);
      try {
        const fallback = await refundFromRewardWallet(
          claim.reward.holderWallet,
          incomingLamports,
        );
        refundTxSig = fallback.signature;
      } catch (fallbackError) {
        console.error("Reward wallet refund failed:", fallbackError);
        return NextResponse.json(
          {
            status: "ERROR",
            message:
              "Gift card purchased but SOL refund failed. Contact support.",
          },
          { status: 500 },
        );
      }
    }

    await sweepTempWalletToReward(tempSecret);

    const finalized = await prisma.$transaction(async (tx) => {
      const claimUpdate = await tx.claim.updateMany({
        where: { id: claim.id, status: "VERIFIED" },
        data: {
          status: "REFUNDED",
          refundTxSig,
          activeRewardKey: null,
        },
      });

      if (claimUpdate.count === 0) {
        return false;
      }

      await tx.reward.updateMany({
        where: {
          id: claim.rewardId,
          status: "UNCLAIMED",
          purchaseClaimId: claim.id,
        },
        data: {
          status: "CLAIMED",
          brand: claim.chosenBrand,
          claimedAt: new Date(),
        },
      });

      return true;
    });

    if (!finalized) {
      const refreshed = await prisma.claim.findUniqueOrThrow({
        where: { id: claim.id },
        include: { reward: true },
      });
      if (
        refreshed.status === "REFUNDED" &&
        refreshed.reward.status === "CLAIMED"
      ) {
        return completeResponse(refreshed);
      }
      return NextResponse.json({
        status: "VERIFIED",
        message: "Claim is being finalized.",
      });
    }
  }

  const refreshed = await prisma.claim.findUniqueOrThrow({
    where: { id: claim.id },
    include: { reward: true },
  });

  return completeResponse(refreshed);
}

async function completeResponse(claim: ClaimWithReward) {
  if (!claim.reward.giftCardCodeEnc) {
    return NextResponse.json(
      { status: "ERROR", message: "Gift card not available." },
      { status: 500 },
    );
  }

  if (claim.codeRevealedAt) {
    return NextResponse.json({
      status: "COMPLETE",
      verifiedTxSig: claim.verifiedTxSig,
      refundTxSig: claim.refundTxSig,
      reward: {
        brand: claim.reward.brand,
        platformLabel: formatPlatformLabel(claim.reward.brand),
        amountUsd: claim.reward.amountUsd,
      },
      message:
        "Gift card was already delivered. Save it from your first confirmation screen.",
    });
  }

  const giftCard = decryptGiftCard(claim.reward.giftCardCodeEnc);

  await prisma.claim.updateMany({
    where: { id: claim.id, codeRevealedAt: null },
    data: { codeRevealedAt: new Date() },
  });

  return NextResponse.json({
    status: "COMPLETE",
    verifiedTxSig: claim.verifiedTxSig,
    refundTxSig: claim.refundTxSig,
    reward: {
      brand: claim.reward.brand,
      platformLabel: formatPlatformLabel(claim.reward.brand),
      amountUsd: claim.reward.amountUsd,
      code: giftCard.code,
      pin: giftCard.pin,
      link: giftCard.link,
      instructions: giftCard.instructions,
    },
  });
}

function decryptGiftCard(encrypted: string): GiftCardDetails {
  const decrypted = decrypt(encrypted, config.encryptionKey());
  return JSON.parse(decrypted) as GiftCardDetails;
}
