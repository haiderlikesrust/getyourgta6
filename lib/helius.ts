import { randomInt } from "crypto";
import { config } from "./config";

export interface TokenHolder {
  owner: string;
  amount: number;
}

interface HeliusTokenAccount {
  owner: string;
  amount: number;
}

interface HeliusResponse {
  result?: {
    token_accounts: HeliusTokenAccount[];
    total?: number;
  };
  error?: { message: string };
}

export async function fetchTokenHolders(mint?: string): Promise<TokenHolder[]> {
  const tokenMint = mint ?? config.tokenMint();
  const rpcUrl = config.solanaRpcUrl();

  const ownerMap = new Map<string, number>();
  let page = 1;

  while (true) {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `holders-page-${page}`,
        method: "getTokenAccounts",
        params: {
          mint: tokenMint,
          page,
          limit: 1000,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status}`);
    }

    const data = (await response.json()) as HeliusResponse;
    if (data.error) {
      throw new Error(`Helius RPC error: ${data.error.message}`);
    }

    const accounts = data.result?.token_accounts ?? [];
    if (accounts.length === 0) break;

    for (const account of accounts) {
      const existing = ownerMap.get(account.owner) ?? 0;
      ownerMap.set(account.owner, existing + account.amount);
    }

    if (accounts.length < 1000) break;
    page += 1;
  }

  return Array.from(ownerMap.entries()).map(([owner, amount]) => ({
    owner,
    amount,
  }));
}

export function filterEligibleHolders(
  holders: TokenHolder[],
  excludeAddresses: Set<string>,
  minHolding: number,
): TokenHolder[] {
  return holders.filter(
    (h) =>
      h.amount >= minHolding &&
      !excludeAddresses.has(h.owner) &&
      h.owner.length > 0,
  );
}

export function pickRandomHolder(holders: TokenHolder[]): TokenHolder | null {
  if (holders.length === 0) return null;
  const index = randomInt(holders.length);
  return holders[index];
}
