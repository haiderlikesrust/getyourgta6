/**
 * Local cron helper — run hourly distribution manually or via system cron.
 *
 * Usage:
 *   npx tsx scripts/trigger-cron.ts
 *
 * Requires CRON_SECRET and the dev server running (or set BASE_URL to production).
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

async function main() {
  if (!CRON_SECRET) {
    console.error("CRON_SECRET is required");
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/api/cron/distribute`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
