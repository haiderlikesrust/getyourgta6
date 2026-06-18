/**
 * Manually trigger Pump.fun creator fee claim (same as /api/cron/claim-fees).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/trigger-pump-claim.ts
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

async function main() {
  if (!CRON_SECRET) {
    console.error("CRON_SECRET is required");
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/api/cron/claim-fees`, {
    headers: { "x-cron-secret": CRON_SECRET },
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  if (!res.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
