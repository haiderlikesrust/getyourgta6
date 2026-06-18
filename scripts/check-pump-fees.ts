/**
 * Check Pump.fun creator vault balance for TOKEN_MINT (no transaction).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/check-pump-fees.ts
 */

import { config } from "../lib/config";
import {
  getPumpCreatorKeypair,
  getPumpCreatorVaultBalanceLamports,
  resolvePumpCreatorPubkey,
} from "../lib/pump-fees";
import { getLamportsBalance, getRewardWalletAddress } from "../lib/solana";

async function main() {
  const creator = await resolvePumpCreatorPubkey();
  const vaultBalance = await getPumpCreatorVaultBalanceLamports(creator);
  const walletLamports = await getLamportsBalance(creator);

  console.log("Token mint:", config.tokenMint());
  console.log("Creator wallet:", creator.toBase58());
  console.log("Reward wallet:", getRewardWalletAddress());
  console.log(
    "Creator keypair matches resolved creator:",
    getPumpCreatorKeypair().publicKey.toBase58() === creator.toBase58(),
  );
  console.log("Vault balance (lamports):", vaultBalance.toString());
  console.log("Wallet balance (lamports):", walletLamports);
  console.log("Min claim threshold:", config.pumpMinClaimLamports());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
