import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import {
  TX_FEE_RESERVE_LAMPORTS,
  getLamportsBalance,
  getRewardKeypair,
  transferSol,
} from "./solana";

/**
 * Creator-wallet helpers that do NOT need the pump.fun SDK, so routes like
 * /api/stats and the claim flow never have to load it.
 */

export function getPumpCreatorKeypair(): Keypair {
  return Keypair.fromSecretKey(bs58.decode(config.pumpCreatorWalletSecret()));
}

/** Move the creator wallet's SOL into the treasury (no-op when they are the same wallet). */
export async function sweepCreatorToReward(
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

  const signature = await transferSol(creatorKeypair, rewardPubkey, sweepable);
  return { signature, sweptLamports: sweepable };
}
