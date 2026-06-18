import { config } from "./config";

export interface SolPrice {
  usdPrice: number;
  blockId?: number;
}

export async function getSolUsdPrice(): Promise<SolPrice> {
  const headers: Record<string, string> = {};
  const apiKey = config.jupApiKey();
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const url = `https://api.jup.ag/price/v3?ids=${config.solMint}`;
  const response = await fetch(url, {
    headers,
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Jupiter price API error: ${response.status}`);
  }

  const data = (await response.json()) as Record<
    string,
    { usdPrice?: number; blockId?: number }
  >;
  const solData = data[config.solMint];
  if (!solData?.usdPrice) {
    throw new Error("SOL price unavailable from Jupiter");
  }

  return {
    usdPrice: solData.usdPrice,
    blockId: solData.blockId,
  };
}

export function solToUsd(solAmount: number, solUsdPrice: number): number {
  return solAmount * solUsdPrice;
}

export function usdToSol(usdAmount: number, solUsdPrice: number): number {
  if (solUsdPrice <= 0) return 0;
  return usdAmount / solUsdPrice;
}
