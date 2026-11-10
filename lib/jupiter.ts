import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { config } from "./config";
import { getConnection } from "./solana";

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct?: string;
  swapUsdValue?: string;
  routePlan?: Array<{ swapInfo?: { label?: string } }>;
  [key: string]: unknown;
}

interface JupiterSwapResponse {
  swapTransaction?: string;
  lastValidBlockHeight?: number;
  error?: string;
  simulationError?: { error?: string } | null;
}

export interface SwapResult {
  signature: string;
  inputMint: string;
  outputMint: string;
  inAmountRaw: string;
  /** quoted output; the on-chain amount can differ within slippage */
  outAmountRaw: string;
  usdValue: number;
  route: string[];
}

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  const apiKey = config.jupApiKey();
  if (apiKey) h["x-api-key"] = apiKey;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function readJson<T>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // fall through
  }
  if (!res.ok) {
    const message =
      (parsed as { error?: string; message?: string } | null)?.error ??
      (parsed as { message?: string } | null)?.message ??
      text.slice(0, 200);
    throw new Error(`Jupiter ${what} failed (${res.status}): ${message}`);
  }
  if (!parsed) throw new Error(`Jupiter ${what}: empty response`);
  return parsed as T;
}

export async function getSwapQuote(params: {
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
  slippageBps?: number;
}): Promise<JupiterQuote> {
  const query = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amountRaw.toString(),
    slippageBps: String(params.slippageBps ?? config.swapSlippageBps()),
    swapMode: "ExactIn",
    restrictIntermediateTokens: "true",
  });
  const res = await fetch(`${config.jupSwapBaseUrl()}/quote?${query}`, {
    headers: headers(),
    cache: "no-store",
  });
  return readJson<JupiterQuote>(res, "quote");
}

/**
 * Swap `amountRaw` of `inputMint` held by `owner` into `outputMint` on Jupiter.
 * Works for Token-2022 inputs (e.g. tokenized stocks) and wraps/unwraps SOL.
 */
export async function swapExactIn(params: {
  owner: Keypair;
  inputMint: string;
  outputMint: string;
  amountRaw: bigint;
  slippageBps?: number;
}): Promise<SwapResult> {
  const { owner, inputMint, outputMint, amountRaw } = params;
  if (amountRaw <= BigInt(0)) throw new Error("Swap amount must be positive");

  const quote = await getSwapQuote(params);

  const impactPercent = Number.parseFloat(quote.priceImpactPct ?? "0") * 100;
  if (
    Number.isFinite(impactPercent) &&
    impactPercent > config.swapMaxPriceImpactPercent()
  ) {
    throw new Error(
      `Swap refused: price impact ${impactPercent.toFixed(2)}% exceeds ${config.swapMaxPriceImpactPercent()}%`,
    );
  }

  const swapRes = await fetch(`${config.jupSwapBaseUrl()}/swap`, {
    method: "POST",
    headers: headers(true),
    cache: "no-store",
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: owner.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 1_000_000,
          priorityLevel: "high",
        },
      },
    }),
  });
  const swap = await readJson<JupiterSwapResponse>(swapRes, "swap");
  if (!swap.swapTransaction) {
    throw new Error(`Jupiter swap: no transaction returned (${swap.error ?? "unknown"})`);
  }
  if (swap.simulationError?.error) {
    throw new Error(`Jupiter swap simulation failed: ${swap.simulationError.error}`);
  }

  const connection = getConnection();
  const tx = VersionedTransaction.deserialize(
    Buffer.from(swap.swapTransaction, "base64"),
  );
  tx.sign([owner]);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    maxRetries: 3,
  });

  const lastValidBlockHeight =
    swap.lastValidBlockHeight ??
    (await connection.getLatestBlockhash("confirmed")).lastValidBlockHeight;

  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: tx.message.recentBlockhash,
      lastValidBlockHeight,
    },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error(
      `Swap ${signature} failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  return {
    signature,
    inputMint,
    outputMint,
    inAmountRaw: quote.inAmount,
    outAmountRaw: quote.outAmount,
    usdValue: Number.parseFloat(quote.swapUsdValue ?? "0") || 0,
    route: (quote.routePlan ?? [])
      .map((step) => step.swapInfo?.label)
      .filter((label): label is string => !!label),
  };
}
