/**
 * Discover Bitrefill product IDs for the brands you want to gift.
 *
 * Usage:
 *   npx tsx scripts/find-products.ts playstation
 *   npx tsx scripts/find-products.ts xbox
 *
 * Requires BITREFILL_API_KEY (Personal) or BITREFILL_API_ID + BITREFILL_API_SECRET (Business).
 */

const BASE_URL = process.env.BITREFILL_BASE_URL ?? "https://api.bitrefill.com/v2";

function authHeaders(): Record<string, string> {
  const id = process.env.BITREFILL_API_ID;
  const secret = process.env.BITREFILL_API_SECRET;
  if (id && secret) {
    const token = Buffer.from(`${id}:${secret}`).toString("base64");
    return { Authorization: `Basic ${token}` };
  }
  const key = process.env.BITREFILL_API_KEY;
  if (!key) {
    console.error("Set BITREFILL_API_KEY or BITREFILL_API_ID + BITREFILL_API_SECRET");
    process.exit(1);
  }
  return { Authorization: `Bearer ${key}` };
}

interface Product {
  id: string;
  name: string;
  country?: string;
  currency?: string;
  packages?: { package_id: string; value: number | string }[];
  range?: { min: number; max: number; step: number };
}

async function main() {
  const query = process.argv[2] ?? "playstation";
  const headers = authHeaders();

  const res = await fetch(
    `${BASE_URL}/products/search?q=${encodeURIComponent(query)}&limit=50`,
    { headers },
  );
  if (!res.ok) {
    console.error(`Search failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const { data } = (await res.json()) as { data: Product[] };
  if (!data?.length) {
    console.log(`No products found for "${query}".`);
    return;
  }

  for (const p of data) {
    console.log(`\n${p.id}  —  ${p.name} (${p.country ?? "?"} / ${p.currency ?? "?"})`);
    if (p.packages?.length) {
      const values = p.packages.map((pkg) => pkg.value).join(", ");
      console.log(`  packages: ${values}`);
    }
    if (p.range) {
      console.log(`  range: ${p.range.min}-${p.range.max} step ${p.range.step}`);
    }
  }

  console.log(
    `\nSet the product id in .env, e.g.\n  BITREFILL_PRODUCT_${query.toUpperCase()}=<id from above>`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
