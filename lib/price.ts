import { config } from "./config";

export interface SolPrice {
  usdPrice: number;
  blockId?: number;
}

function jupHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = config.jupApiKey();
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

/** USD prices for any set of mints via Jupiter Price v3. Missing mints are omitted. */
export async function getUsdPrices(
  mints: string[],
): Promise<Record<string, number>> {
  const unique = Array.from(new Set(mints.filter(Boolean)));
  if (unique.length === 0) return {};

  const url = `https://api.jup.ag/price/v3?ids=${unique.join(",")}`;
  const response = await fetch(url, {
    headers: jupHeaders(),
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Jupiter price API error: ${response.status}`);
  }

  const data = (await response.json()) as Record<
    string,
    { usdPrice?: number } | null
  >;

  const out: Record<string, number> = {};
  for (const mint of unique) {
    const price = data[mint]?.usdPrice;
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      out[mint] = price;
    }
  }
  return out;
}

export async function getSolUsdPrice(): Promise<SolPrice> {
  const prices = await getUsdPrices([config.solMint]);
  const usdPrice = prices[config.solMint];
  if (!usdPrice) {
    throw new Error("SOL price unavailable from Jupiter");
  }
  return { usdPrice };
}

export function solToUsd(solAmount: number, solUsdPrice: number): number {
  return solAmount * solUsdPrice;
}

export function usdToSol(usdAmount: number, solUsdPrice: number): number {
  if (solUsdPrice <= 0) return 0;
  return usdAmount / solUsdPrice;
}
