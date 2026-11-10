import type { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { config } from "./config";
import { getPumpCreatorKeypair, sweepCreatorToReward } from "./creator-wallet";
import {
  getConnection,
  getLamportsBalance,
  getRewardKeypair,
  getRewardWalletAddress,
} from "./solana";

export { getPumpCreatorKeypair, sweepCreatorToReward };

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
    // The SDK's ES-module build imports a named export (`BN`) that its CommonJS
    // dependency does not provide, so `import` throws on current Node versions.
    // `require` resolves the package's working CommonJS build instead.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require("@pump-fun/pump-sdk") as typeof import("@pump-fun/pump-sdk");
    pumpSdkInstance = new sdk.OnlinePumpSdk(getConnection());
  }
  return pumpSdkInstance;
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

// ---------------------------------------------------------------------------
// Creator rewards paid in a token (e.g. TTWO tokenized stock) instead of SOL
// ---------------------------------------------------------------------------

export interface TokenFeeClaimResult {
  status: "claimed" | "skipped" | "error";
  reason?: string;
  creatorWallet?: string;
  mint?: string;
  /** reward tokens the claim moved into the creator wallet (UI units) */
  claimedTokens?: number;
  signature?: string;
}

function readTokenAmount(data: Buffer | null | undefined): bigint {
  // SPL token account layout: mint(32) owner(32) amount(u64 LE)
  if (!data || data.length < 72) return BigInt(0);
  return data.readBigUInt64LE(64);
}

/**
 * Collect creator rewards that are denominated in `REWARD_TOKEN_MINT`.
 * The claim is simulated first; nothing is sent unless it would actually
 * move tokens into the creator wallet.
 */
export async function claimCreatorRewardToken(): Promise<TokenFeeClaimResult> {
  const mintAddress = config.rewardTokenMint();
  if (!mintAddress || mintAddress === config.solMint) {
    return { status: "skipped", reason: "no_reward_token_configured" };
  }

  const connection = getConnection();
  const creator = await resolvePumpCreatorPubkey();
  const creatorKeypair = getPumpCreatorKeypair();
  const creatorWallet = creator.toBase58();

  if (!creatorKeypair.publicKey.equals(creator)) {
    return {
      status: "error",
      reason: "creator_secret_mismatch",
      creatorWallet,
      mint: mintAddress,
    };
  }

  const mint = new PublicKey(mintAddress);
  const mintInfo = await connection.getParsedAccountInfo(mint);
  if (!mintInfo.value) {
    return { status: "error", reason: "reward_mint_not_found", mint: mintAddress };
  }
  const tokenProgram = mintInfo.value.owner;
  const decimals =
    (mintInfo.value.data as { parsed?: { info?: { decimals?: number } } }).parsed
      ?.info?.decimals ?? 0;

  const instructions = await getPumpSdk().collectCoinCreatorFeeV2Instructions(
    creator,
    mint,
    tokenProgram,
    creatorKeypair.publicKey,
  );
  if (instructions.length === 0) {
    return {
      status: "skipped",
      reason: "no_claim_instructions",
      creatorWallet,
      mint: mintAddress,
    };
  }

  const creatorTokenAccount = getAssociatedTokenAddressSync(
    mint,
    creator,
    true,
    tokenProgram,
  );
  const before = readTokenAmount(
    (await connection.getAccountInfo(creatorTokenAccount))?.data,
  );

  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = creatorKeypair.publicKey;

  const simulation = await connection.simulateTransaction(
    transaction,
    [creatorKeypair],
    [creatorTokenAccount],
  );
  if (simulation.value.err) {
    return {
      status: "skipped",
      reason: "nothing_to_claim",
      creatorWallet,
      mint: mintAddress,
    };
  }
  const simulated = simulation.value.accounts?.[0]?.data?.[0];
  const after = readTokenAmount(
    simulated ? Buffer.from(simulated, "base64") : null,
  );
  const claimable = after > before ? after - before : BigInt(0);
  if (claimable === BigInt(0)) {
    return {
      status: "skipped",
      reason: "nothing_to_claim",
      creatorWallet,
      mint: mintAddress,
    };
  }

  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(...instructions),
    [creatorKeypair],
    { commitment: "confirmed" },
  );

  return {
    status: "claimed",
    creatorWallet,
    mint: mintAddress,
    claimedTokens: Number(claimable) / 10 ** decimals,
    signature,
  };
}
