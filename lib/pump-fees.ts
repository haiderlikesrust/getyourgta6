import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import {
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import {
  TX_FEE_RESERVE_LAMPORTS,
  getConnection,
  getLamportsBalance,
  getRewardKeypair,
  getRewardWalletAddress,
  transferSol,
} from "./solana";

export interface PumpFeeClaimResult {
  status: "claimed" | "skipped" | "error";
  reason?: string;
  creatorWallet?: string;
  rewardWallet?: string;
  vaultBalanceLamports?: string;
  claimedLamports?: string;
  sweptLamports?: string;
  signature?: string;
  sweepSignature?: string;
  walletBalanceSol?: number;
}

let pumpSdkInstance: OnlinePumpSdk | null = null;

function getPumpSdk(): OnlinePumpSdk {
  if (!pumpSdkInstance) {
    pumpSdkInstance = new OnlinePumpSdk(getConnection());
  }
  return pumpSdkInstance;
}

export function getPumpCreatorKeypair(): Keypair {
  return Keypair.fromSecretKey(
    bs58.decode(config.pumpCreatorWalletSecret()),
  );
}

export async function resolvePumpCreatorPubkey(): Promise<PublicKey> {
  const explicit = config.pumpCreatorWallet();
  if (explicit) {
    return new PublicKey(explicit);
  }

  const mint = new PublicKey(config.tokenMint());
  const sdk = getPumpSdk();

  try {
    const bondingCurve = await sdk.fetchBondingCurve(mint);
    return bondingCurve.creator;
  } catch {
    return getPumpCreatorKeypair().publicKey;
  }
}

export async function getPumpCreatorVaultBalanceLamports(
  creator?: PublicKey,
): Promise<bigint> {
  const creatorPubkey = creator ?? (await resolvePumpCreatorPubkey());
  const sdk = getPumpSdk();
  const balance = await sdk.getCreatorVaultBalanceBothPrograms(creatorPubkey);
  return BigInt(balance.toString());
}

async function sweepCreatorToReward(
  creatorKeypair: Keypair,
): Promise<{ signature: string; sweptLamports: number } | null> {
  const rewardPubkey = getRewardKeypair().publicKey;
  if (creatorKeypair.publicKey.equals(rewardPubkey)) {
    return null;
  }

  const balance = await getLamportsBalance(creatorKeypair.publicKey);
  const sweepable = balance - TX_FEE_RESERVE_LAMPORTS;
  if (sweepable <= 0) {
    return null;
  }

  const signature = await transferSol(
    creatorKeypair,
    rewardPubkey,
    sweepable,
  );

  return { signature, sweptLamports: sweepable };
}

export async function claimPumpCreatorFees(): Promise<PumpFeeClaimResult> {
  const creator = await resolvePumpCreatorPubkey();
  const creatorAddress = creator.toBase58();
  const creatorKeypair = getPumpCreatorKeypair();
  const rewardAddress = getRewardWalletAddress();

  if (!creatorKeypair.publicKey.equals(creator)) {
    return {
      status: "error",
      reason: "creator_secret_mismatch",
      creatorWallet: creatorAddress,
      rewardWallet: rewardAddress,
    };
  }

  const sdk = getPumpSdk();
  const vaultBalance = await sdk.getCreatorVaultBalanceBothPrograms(creator);
  const minClaim = config.pumpMinClaimLamports();

  if (vaultBalance <= BigInt(minClaim)) {
    const walletBalanceSol =
      (await getLamportsBalance(creator)) / config.lamportsPerSol;
    return {
      status: "skipped",
      reason: "below_minimum_vault_balance",
      creatorWallet: creatorAddress,
      rewardWallet: rewardAddress,
      vaultBalanceLamports: vaultBalance.toString(),
      walletBalanceSol,
    };
  }

  const walletBefore = await getLamportsBalance(creator);
  const instructions = await sdk.collectCoinCreatorFeeInstructions(
    creator,
    creatorKeypair.publicKey,
  );

  if (instructions.length === 0) {
    return {
      status: "skipped",
      reason: "no_claim_instructions",
      creatorWallet: creatorAddress,
      rewardWallet: rewardAddress,
      vaultBalanceLamports: vaultBalance.toString(),
    };
  }

  const transaction = new Transaction().add(...instructions);
  const signature = await sendAndConfirmTransaction(
    getConnection(),
    transaction,
    [creatorKeypair],
    { commitment: "confirmed" },
  );

  const walletAfterClaim = await getLamportsBalance(creator);
  const claimedLamports = Math.max(0, walletAfterClaim - walletBefore);

  const sweep = await sweepCreatorToReward(creatorKeypair);
  const finalBalance = await getLamportsBalance(
    creatorKeypair.publicKey.equals(getRewardKeypair().publicKey)
      ? creator
      : getRewardKeypair().publicKey,
  );

  return {
    status: "claimed",
    creatorWallet: creatorAddress,
    rewardWallet: rewardAddress,
    vaultBalanceLamports: vaultBalance.toString(),
    claimedLamports: claimedLamports.toString(),
    sweptLamports: sweep?.sweptLamports.toString(),
    signature,
    sweepSignature: sweep?.signature,
    walletBalanceSol: finalBalance / config.lamportsPerSol,
  };
}
