/**
 * Test the weighted draw without funding the wallet or buying gift cards.
 * Uses the live holder snapshot + the opt-ins in your database.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/test-holder-pick.ts
 *   npx tsx --env-file=.env scripts/test-holder-pick.ts --runs 1000
 */

import { buildDrawPool, drawRules, pickWeightedWinner } from "../lib/draw";

function parseRuns(): number {
  const idx = process.argv.indexOf("--runs");
  const runs = idx >= 0 ? Number.parseInt(process.argv[idx + 1] ?? "", 10) : 5;
  return Number.isFinite(runs) && runs > 0 ? runs : 5;
}

async function main() {
  const runs = parseRuns();
  const rules = drawRules();

  console.log("=== Weighted draw test ===");
  console.log(
    `Rules: hold >= ${rules.boostPercent}% of supply -> ${rules.boostMultiplier} tickets, opt-in -> 1 ticket`,
  );
  console.log(`Holders auto-entered: ${rules.holdersAutoEnter}\n`);

  const pool = await buildDrawPool();
  console.log(`Token holders:        ${pool.totalHolders}`);
  console.log(`Opt-ins in database:  ${pool.optIns}`);
  console.log(`Boosted holders:      ${pool.holderEntrants}`);
  console.log(`Open entries:         ${pool.openEntrants}`);
  console.log(`Total tickets:        ${pool.totalTickets}`);

  if (pool.entrants.length === 0) {
    console.log("\nNobody is in the draw. Check TOKEN_MINT and opt-ins.");
    process.exit(1);
  }

  const wins = { holder: 0, open: 0 };
  console.log(`\nRunning ${runs} pick(s):\n`);
  for (let i = 1; i <= runs; i++) {
    const winner = pickWeightedWinner(pool.entrants);
    if (!winner) break;
    wins[winner.tier] += 1;
    if (runs <= 20) {
      console.log(
        `Pick ${i}: ${winner.wallet} [${winner.tier}, ${winner.weight} ticket(s)]`,
      );
    }
  }

  const holderTickets = pool.holderEntrants * rules.boostMultiplier;
  console.log(
    `\nHolder wins: ${wins.holder}/${runs} (expected ~${((holderTickets / pool.totalTickets) * 100).toFixed(1)}%)`,
  );
  console.log(`Open wins:   ${wins.open}/${runs}`);
}

main().catch((err) => {
  console.error("Test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
