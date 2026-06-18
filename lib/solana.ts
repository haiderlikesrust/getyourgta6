import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  ParsedTransactionWithMeta,
} from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";

let connectionInstance: Connection | null = null;

export function getConnection(): Connection {
  if (!connectionInstance) {
    connectionInstance = new Connection(config.solanaRpcUrl(), "confirmed");
  }
  return connectionInstance;
}

export function getRewardKeypair(): Keypair {
  const secret = config.rewardWalletSecret();
  return Keypair.fromSecretKey(bs58.decode(secret));
}

export function getRewardWalletAddress(): string {
  return getRewardKeypair().publicKey.toBase58();
}

export function generateTempKeypair(): Keypair {
  return Keypair.generate();
}

export function keypairFromSecret(secretBase58: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(secretBase58));
}

export function secretToBase58(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}

/** Lamports to leave in wallet to pay the network fee for a simple transfer */
export const TX_FEE_RESERVE_LAMPORTS = 5_000;

export async function getLamportsBalance(pubkey: PublicKey | string): Promise<number> {
  const connection = getConnection();
  const key = typeof pubkey === "string" ? new PublicKey(pubkey) : pubkey;
  return connection.getBalance(key);
}

export async function getSolBalance(pubkey: PublicKey | string): Promise<number> {
  const lamports = await getLamportsBalance(pubkey);
  return lamports / LAMPORTS_PER_SOL;
}

export async function getRewardWalletBalanceSol(): Promise<number> {
  const keypair = getRewardKeypair();
  return getSolBalance(keypair.publicKey);
}

export async function transferSol(
  from: Keypair,
  to: PublicKey | string,
  lamports: number,
): Promise<string> {
  const connection = getConnection();
  const destination =
    typeof to === "string" ? new PublicKey(to) : to;

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: destination,
      lamports,
    }),
  );

  return sendAndConfirmTransaction(connection, transaction, [from], {
    commitment: "confirmed",
  });
}

/**
 * Refund verification SOL from temp wallet back to winner.
 * Cannot send the full received amount — the temp wallet must keep
 * TX_FEE_RESERVE_LAMPORTS to pay the outgoing transfer fee.
 */
export async function refundVerification(
  tempKeypair: Keypair,
  winnerWallet: string,
  receivedLamports: number,
): Promise<{ signature: string; refundedLamports: number }> {
  const balance = await getLamportsBalance(tempKeypair.publicKey);
  const maxRefundable = balance - TX_FEE_RESERVE_LAMPORTS;

  if (maxRefundable <= 0) {
    throw new Error(
      `Temp wallet balance too low to refund (${balance} lamports)`,
    );
  }

  const refundLamports = Math.min(receivedLamports, maxRefundable);
  const signature = await transferSol(
    tempKeypair,
    winnerWallet,
    refundLamports,
  );

  return { signature, refundedLamports: refundLamports };
}

/** Fallback when temp wallet was already swept after a failed refund attempt */
export async function refundFromRewardWallet(
  winnerWallet: string,
  lamports: number,
): Promise<{ signature: string; refundedLamports: number }> {
  const rewardKeypair = getRewardKeypair();
  const balance = await getLamportsBalance(rewardKeypair.publicKey);
  const maxRefundable = balance - TX_FEE_RESERVE_LAMPORTS;

  if (maxRefundable <= 0) {
    throw new Error("Reward wallet has insufficient balance for refund fallback");
  }

  const refundLamports = Math.min(lamports, maxRefundable);
  const signature = await transferSol(
    rewardKeypair,
    winnerWallet,
    refundLamports,
  );

  return { signature, refundedLamports: refundLamports };
}

export interface IncomingTransfer {
  signature: string;
  sender: string;
  lamports: number;
}

export async function findIncomingTransfer(
  tempPubkey: string,
  expectedSender: string,
  minLamports: number,
  maxLamports?: number,
): Promise<IncomingTransfer | null> {
  const connection = getConnection();
  const tempKey = new PublicKey(tempPubkey);
  const upperBound = maxLamports ?? minLamports + 100_000;

  const signatures = await connection.getSignaturesForAddress(tempKey, {
    limit: 20,
  });

  for (const sigInfo of signatures) {
    if (sigInfo.err) continue;

    const tx = await connection.getParsedTransaction(sigInfo.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;

    const transfer = extractTransferToAddress(
      tx,
      tempPubkey,
      expectedSender,
      minLamports,
      upperBound,
    );
    if (transfer) {
      return {
        signature: sigInfo.signature,
        sender: transfer.sender,
        lamports: transfer.lamports,
      };
    }
  }

  return null;
}

function extractTransferToAddress(
  tx: ParsedTransactionWithMeta,
  destination: string,
  expectedSender: string,
  minLamports: number,
  maxLamports: number,
): { sender: string; lamports: number } | null {
  const instructions = tx.transaction.message.instructions;

  for (const ix of instructions) {
    if (!("parsed" in ix)) continue;
    const parsed = ix.parsed;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("type" in parsed) ||
      parsed.type !== "transfer"
    ) {
      continue;
    }

    const info = (parsed as { info?: Record<string, unknown> }).info;
    if (!info) continue;

    const dest = info.destination as string | undefined;
    const source = info.source as string | undefined;
    const lamports = Number(info.lamports ?? 0);

    if (
      dest === destination &&
      source === expectedSender &&
      lamports >= minLamports &&
      lamports <= maxLamports
    ) {
      return { sender: source, lamports };
    }
  }

  return null;
}

export async function sweepTempWalletToReward(
  tempSecretBase58: string,
): Promise<string | null> {
  const tempKeypair = keypairFromSecret(tempSecretBase58);
  const connection = getConnection();
  const balance = await connection.getBalance(tempKeypair.publicKey);

  if (balance <= TX_FEE_RESERVE_LAMPORTS) return null;

  const rewardKeypair = getRewardKeypair();
  const lamportsToSend = balance - TX_FEE_RESERVE_LAMPORTS;

  return transferSol(tempKeypair, rewardKeypair.publicKey, lamportsToSend);
}
