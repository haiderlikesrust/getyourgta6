/**
 * Test the random holder selector without funding the wallet or buying gift cards.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/test-holder-pick.ts
 *   npx tsx --env-file=.env scripts/test-holder-pick.ts --runs 10
 *   npx tsx --env-file=.env scripts/test-holder-pick.ts --mint YOUR_TOKEN_MINT
 */

import { config } from "../lib/config";
import {
  fetchTokenHolders,
  filterEligibleHolders,
  pickRandomHolder,
} from "../lib/helius";

function parseArgs() {
  const args = process.argv.slice(2);
  let runs = 5;
  let mint: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--runs" && args[i + 1]) {
      runs = Number.parseInt(args[i + 1], 10);
      i += 1;
    } else if (args[i] === "--mint" && args[i + 1]) {
      mint = args[i + 1];
      i += 1;
    }
  }

  return { runs: Number.isFinite(runs) && runs > 0 ? runs : 5, mint };
}

async function main() {
  const { runs, mint } = parseArgs();
  const tokenMint = mint ?? config.tokenMint();

  console.log("=== Holder selector test ===");
  console.log("Token mint:", tokenMint);
  console.log("Min holding:", config.minHolding());
  console.log("Excluded wallets:", config.excludeAddresses().size);
  console.log("");

  console.log("Fetching holders from Helius...");
  const holders = await fetchTokenHolders(tokenMint);
  console.log(`Total unique holders: ${holders.length}`);

  const eligible = filterEligibleHolders(
    holders,
    config.excludeAddresses(),
    config.minHolding(),
  );
  console.log(`Eligible holders: ${eligible.length}`);

  if (eligible.length === 0) {
    console.log("\nNo eligible holders. Check TOKEN_MINT and MIN_HOLDING.");
    process.exit(1);
  }

  console.log(`\nRunning ${runs} random pick(s):\n`);

  const seen = new Set<string>();
  for (let i = 1; i <= runs; i++) {
    const winner = pickRandomHolder(eligible);
    if (!winner) break;
    seen.add(winner.owner);
    console.log(
      `Pick ${i}: ${winner.owner} (amount: ${winner.amount.toLocaleString()})`,
    );
  }

  console.log(`\nUnique winners in ${runs} picks: ${seen.size}/${runs}`);
  if (runs > 1 && seen.size === 1 && eligible.length > 1) {
    console.log("(Same wallet twice can happen by chance with few runs)");
  }

  console.log("\nTop 5 holders by balance:");
  const top = [...eligible].sort((a, b) => b.amount - a.amount).slice(0, 5);
  for (const h of top) {
    console.log(`  ${h.owner} — ${h.amount.toLocaleString()}`);
  }
}

main().catch((err) => {
  console.error("Test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
