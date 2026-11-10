import { randomBytes } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { config } from "./config";
import { getUsdPrices } from "./price";
import { getRewardKeypair, getRewardWalletAddress } from "./solana";
import {
  USDC_DECIMALS,
  getPaymentState,
  prepareSolPayment,
  prepareUsdcPayment,
  sendTrackedPayment,
} from "./treasury";

export interface GiftCardPurchase {
  brand: string;
  productId: string;
  amountUsd: number;
  code?: string;
  pin?: string;
  link?: string;
  instructions?: string;
  orderId: string;
  invoiceId?: string;
  paymentTxSig?: string;
}

interface BitrefillPackage {
  package_id: string;
  value: number | string;
}

interface BitrefillProduct {
  id: string;
  name: string;
  packages?: BitrefillPackage[];
  range?: { min: number; max: number; step: number };
}

interface BitrefillOrder {
  id: string;
  status: string;
  redemption_info?: {
    code?: string;
    pin?: string;
    link?: string;
    instructions?: string;
  };
  error?: string;
}

interface BitrefillPayment {
  address: string;
  price: number | string;
  currency: string;
}

interface BitrefillInvoice {
  id: string;
  status: string;
  orders: BitrefillOrder[];
  payment?: BitrefillPayment;
}

interface BitrefillEnvelope<T> {
  meta?: Record<string, unknown>;
  data: T;
  error?: { code?: string; message?: string };
}

const TERMINAL_INVOICE_OK = "complete";
const TERMINAL_INVOICE_FAIL = ["blocked", "denied", "payment_error"];
const ORDER_DELIVERED = "delivered";
const ORDER_FAILED = ["failed", "refunded"];

function authHeaders(): Record<string, string> {
  const id = config.bitrefillApiId();
  const secret = config.bitrefillApiSecret();
  if (id && secret) {
    const token = Buffer.from(`${id}:${secret}`).toString("base64");
    return { Authorization: `Basic ${token}` };
  }
  const key = config.bitrefillApiKey();
  if (!key) {
    throw new Error(
      "Bitrefill credentials missing: set BITREFILL_API_KEY (Personal) or BITREFILL_API_ID + BITREFILL_API_SECRET (Business)",
    );
  }
  return { Authorization: `Bearer ${key}` };
}

function jsonHeaders(): Record<string, string> {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

async function brFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<BitrefillEnvelope<T>> {
  const res = await fetch(`${config.bitrefillBaseUrl()}${path}`, init);
  const text = await res.text();
  let parsed: BitrefillEnvelope<T> | null = null;
  try {
    parsed = text ? (JSON.parse(text) as BitrefillEnvelope<T>) : null;
  } catch {
    // non-JSON body
  }

  if (!res.ok) {
    const message =
      parsed?.error?.message ?? text ?? `Bitrefill request failed (${res.status})`;
    throw new Error(`Bitrefill ${path} -> ${res.status}: ${message}`);
  }
  if (!parsed) {
    throw new Error(`Bitrefill ${path}: empty/invalid response`);
  }
  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ping(): Promise<boolean> {
  const res = await brFetch<{ message: string }>("/ping", {
    headers: authHeaders(),
  });
  return res.data?.message === "pong";
}

export async function getAccountBalance(): Promise<{
  balance: number;
  currency: string;
}> {
  const res = await brFetch<{ balance: number; currency: string }>(
    "/accounts/balance",
    { headers: authHeaders() },
  );
  return res.data;
}

interface LineItem {
  product_id: string;
  package_id?: string;
  value?: number;
  quantity: number;
}

async function resolveLineItem(
  productId: string,
  amountUsd: number,
): Promise<LineItem> {
  const res = await brFetch<BitrefillProduct>(
    `/products/${encodeURIComponent(productId)}`,
    { headers: authHeaders() },
  );
  const product = res.data;

  if (product.packages?.length) {
    const exact = product.packages.find(
      (p) => Number(p.value) === amountUsd,
    );
    if (exact) {
      return { product_id: productId, package_id: exact.package_id, quantity: 1 };
    }
  }

  if (product.range) {
    const { min, max } = product.range;
    if (amountUsd >= min && amountUsd <= max) {
      return { product_id: productId, value: amountUsd, quantity: 1 };
    }
  }

  if (product.packages?.length && config.bitrefillMode() !== "live") {
    const closest = product.packages.reduce((a, b) =>
      Math.abs(Number(b.value) - amountUsd) < Math.abs(Number(a.value) - amountUsd)
        ? b
        : a,
    );
    return { product_id: productId, package_id: closest.package_id, quantity: 1 };
  }

  throw new Error(
    `No usable denomination for product "${productId}" at $${amountUsd}`,
  );
}

async function waitForInvoice(
  invoiceId: string,
  maxAttempts = 15,
): Promise<BitrefillInvoice> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await brFetch<BitrefillInvoice>(
      `/invoices/${encodeURIComponent(invoiceId)}`,
      { headers: authHeaders() },
    );
    const invoice = res.data;
    if (invoice.status === TERMINAL_INVOICE_OK) return invoice;
    if (TERMINAL_INVOICE_FAIL.includes(invoice.status)) {
      throw new Error(`Invoice ${invoiceId} ${invoice.status}`);
    }
    await delay(2000);
  }
  throw new Error(`Invoice ${invoiceId} did not complete in time`);
}

async function waitForOrder(orderId: string): Promise<BitrefillOrder> {
  const maxAttempts = 15;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await brFetch<BitrefillOrder>(
      `/orders/${encodeURIComponent(orderId)}`,
      { headers: authHeaders() },
    );
    const order = res.data;
    if (order.status === ORDER_DELIVERED && order.redemption_info) {
      return order;
    }
    if (ORDER_FAILED.includes(order.status)) {
      throw new Error(`Order ${orderId} ${order.status}: ${order.error ?? ""}`);
    }
    await delay(2000);
  }
  throw new Error(`Order ${orderId} not delivered in time`);
}


// ---------------------------------------------------------------------------
// Paying an invoice on Solana (SOL or USDC) without ever paying it twice
// ---------------------------------------------------------------------------

/** an unpaid invoice older than this is abandoned and a fresh one is opened */
const INVOICE_STALE_MS = 10 * 60 * 1000;
/** a broadcast payment that is still not on-chain after this can no longer land */
const PAYMENT_DEAD_MS = 3 * 60 * 1000;

/**
 * Where a purchase stands between retries. Persisted on the reward so that a
 * timeout, crash or redeploy resumes the same invoice instead of opening and
 * paying a new one.
 */
export interface PurchaseState {
  invoiceId: string | null;
  invoiceAt: Date | null;
  paymentTxSig: string | null;
  paymentAt: Date | null;
  saveInvoice(invoiceId: string): Promise<void>;
  /** called with the signature BEFORE the transaction is broadcast */
  savePayment(signature: string): Promise<void>;
  /** the payment is confirmed on-chain */
  confirmPayment(signature: string, detail: Record<string, unknown>): Promise<void>;
  /** the stored payment never landed and never will */
  clearPayment(): Promise<void>;
  clearInvoice(): Promise<void>;
}

function memoryState(): PurchaseState {
  const state: PurchaseState = {
    invoiceId: null,
    invoiceAt: null,
    paymentTxSig: null,
    paymentAt: null,
    async saveInvoice(id) {
      state.invoiceId = id;
      state.invoiceAt = new Date();
    },
    async savePayment(signature) {
      state.paymentTxSig = signature;
      state.paymentAt = new Date();
    },
    async confirmPayment() {},
    async clearPayment() {
      state.paymentTxSig = null;
      state.paymentAt = null;
    },
    async clearInvoice() {
      state.invoiceId = null;
      state.invoiceAt = null;
    },
  };
  return state;
}

/**
 * Turn Bitrefill's `payment.price` into base units. The docs only call it the
 * "exact amount to send", so both readings (whole coins / base units) are tried
 * and the one that is actually worth about the card's value is used. Anything
 * else is refused rather than sent.
 */
export function resolveCryptoAmount(
  price: number | string,
  decimals: number,
  expectedUsd: number,
  unitUsd: number,
): bigint {
  const amount = typeof price === "string" ? Number.parseFloat(price) : price;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid Bitrefill payment amount: ${price}`);
  }
  const candidates: bigint[] = [BigInt(Math.round(amount * 10 ** decimals))];
  if (Number.isInteger(amount)) candidates.push(BigInt(amount));

  for (const raw of candidates) {
    const usd = (Number(raw) / 10 ** decimals) * unitUsd;
    if (usd >= expectedUsd * 0.85 && usd <= expectedUsd * 1.25) return raw;
  }
  throw new Error(
    `Refusing to pay: Bitrefill asked for ${price}, which is not worth about $${expectedUsd}`,
  );
}

async function fetchInvoice(invoiceId: string): Promise<BitrefillInvoice> {
  const res = await brFetch<BitrefillInvoice>(
    `/invoices/${encodeURIComponent(invoiceId)}`,
    { headers: authHeaders() },
  );
  return res.data;
}

async function createBalanceInvoice(
  lineItem: LineItem,
  state: PurchaseState,
): Promise<BitrefillInvoice> {
  // Resume an invoice an earlier attempt already opened (auto-paid from balance).
  if (state.invoiceId) {
    const existing = await fetchInvoice(state.invoiceId).catch(() => null);
    if (existing && !TERMINAL_INVOICE_FAIL.includes(existing.status)) {
      return existing.status === TERMINAL_INVOICE_OK
        ? existing
        : waitForInvoice(existing.id);
    }
    await state.clearInvoice();
  }

  const createRes = await brFetch<BitrefillInvoice>("/invoices", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      products: [lineItem],
      payment_method: "balance",
      auto_pay: true,
    }),
  });

  let invoice = createRes.data;
  await state.saveInvoice(invoice.id);
  if (invoice.status !== TERMINAL_INVOICE_OK) {
    invoice = await waitForInvoice(invoice.id);
  }
  return invoice;
}

async function payInvoiceOnSolana(
  lineItem: LineItem,
  method: "solana" | "usdc_solana",
  amountUsd: number,
  state: PurchaseState,
): Promise<{ invoice: BitrefillInvoice; paymentTxSig?: string }> {
  let invoice: BitrefillInvoice | null = null;
  let paymentTxSig = state.paymentTxSig;

  // ---- resume whatever an earlier attempt left behind ----
  if (state.invoiceId) {
    invoice = await fetchInvoice(state.invoiceId).catch(() => null);

    if (invoice?.status === TERMINAL_INVOICE_OK) {
      return { invoice, paymentTxSig: paymentTxSig ?? undefined };
    }
    const dead = !invoice || TERMINAL_INVOICE_FAIL.includes(invoice.status);

    if (paymentTxSig) {
      const chain = await getPaymentState(paymentTxSig);
      if (chain === "landed") {
        await state.confirmPayment(paymentTxSig, { method, resumed: true });
        if (dead) {
          throw new Error(
            `Invoice ${state.invoiceId} was paid (${paymentTxSig}) but Bitrefill reports "${invoice?.status ?? "missing"}". Not paying again; needs manual review.`,
          );
        }
        return {
          invoice: await waitForInvoice(state.invoiceId, 45),
          paymentTxSig,
        };
      }
      const age = state.paymentAt ? Date.now() - state.paymentAt.getTime() : 0;
      if (chain === "failed" || age > PAYMENT_DEAD_MS) {
        await state.clearPayment();
        paymentTxSig = null;
      } else {
        throw new Error("Payment is still confirming; retry shortly");
      }
    }

    const invoiceAge = state.invoiceAt
      ? Date.now() - state.invoiceAt.getTime()
      : Infinity;
    if (dead || invoiceAge > INVOICE_STALE_MS) {
      await state.clearInvoice();
      invoice = null;
    }
  }

  // ---- open a new invoice if there is nothing to resume ----
  if (!invoice) {
    const createRes = await brFetch<BitrefillInvoice>("/invoices", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        products: [lineItem],
        payment_method: method,
        refund_address: getRewardWalletAddress(),
        auto_pay: false,
      }),
    });
    invoice = createRes.data;
    await state.saveInvoice(invoice.id);
  }

  const payment = invoice.payment;
  if (!payment?.address || payment.price == null) {
    throw new Error(
      `Invoice ${invoice.id} missing Solana payment details from Bitrefill`,
    );
  }

  // ---- pay it ----
  const payer = getRewardKeypair();
  const destination = new PublicKey(payment.address);
  let tx;
  let detail: Record<string, unknown>;

  if (method === "usdc_solana") {
    const raw = resolveCryptoAmount(payment.price, USDC_DECIMALS, amountUsd, 1);
    tx = await prepareUsdcPayment(payer, destination, raw);
    detail = { asset: "USDC", amountRaw: raw.toString() };
  } else {
    const solPrice = (await getUsdPrices([config.solMint]))[config.solMint];
    if (!solPrice) throw new Error("SOL price unavailable; not paying blind");
    const lamports = resolveCryptoAmount(payment.price, 9, amountUsd, solPrice);
    tx = await prepareSolPayment(payer, destination, Number(lamports));
    detail = { asset: "SOL", lamports: lamports.toString(), solPrice };
  }

  const signature = await sendTrackedPayment(payer, tx, state.savePayment);
  await state.confirmPayment(signature, {
    ...detail,
    method,
    invoiceId: invoice.id,
  });

  return {
    invoice: await waitForInvoice(invoice.id, 45),
    paymentTxSig: signature,
  };
}

function mockPurchase(amountUsd: number, brand: string): GiftCardPurchase {
  const segment = () => randomBytes(4).toString("hex").toUpperCase();
  const code =
    brand === "xbox"
      ? `${segment()}${segment()}${segment()}${segment()}`
      : `${segment()}-${segment()}-${segment()}`;
  return {
    brand,
    productId: `mock-${brand}`,
    amountUsd,
    code,
    pin: brand === "playstation" ? segment().slice(0, 4) : undefined,
    instructions: `Redeem this ${brand} code in the respective store (MOCK — not a real card).`,
    orderId: `mock-${Date.now()}-${randomBytes(4).toString("hex")}`,
  };
}

/**
 * Purchase a gift card via Bitrefill.
 * Modes (config.bitrefillMode):
 *  - mock: returns a fake code, no network call
 *  - test: uses Bitrefill test product (free, real API, balance)
 *  - live: real product, paid per order from the treasury wallet in SOL
 *          (`solana`) or USDC on Solana (`usdc_solana`), or from a pre-funded
 *          Bitrefill balance (`balance`)
 *
 * Pass `state` (persisted per reward) so retries resume instead of re-paying.
 */
export async function purchaseGiftCard(
  amountUsd: number,
  brand: string,
  state: PurchaseState = memoryState(),
): Promise<GiftCardPurchase> {
  const mode = config.bitrefillMode();

  if (mode === "mock") {
    await delay(80);
    return mockPurchase(amountUsd, brand);
  }

  let lineItem: LineItem;
  let productId: string;

  if (mode === "test") {
    productId = config.bitrefillTestProductId();
    lineItem = { product_id: productId, value: amountUsd, quantity: 1 };
  } else {
    const configured = config.bitrefillProductId(brand);
    if (!configured) {
      throw new Error(
        `No Bitrefill product configured for brand "${brand}". Set BITREFILL_PRODUCT_${brand.toUpperCase()} (run scripts/find-products.ts to discover ids).`,
      );
    }
    productId = configured;
    lineItem = await resolveLineItem(productId, amountUsd);
  }

  let invoice: BitrefillInvoice;
  let paymentTxSig: string | undefined;

  const method = config.bitrefillPaymentMethod();
  if (mode === "live" && method !== "balance") {
    const paid = await payInvoiceOnSolana(lineItem, method, amountUsd, state);
    invoice = paid.invoice;
    paymentTxSig = paid.paymentTxSig;
  } else {
    invoice = await createBalanceInvoice(lineItem, state);
  }

  const orderRef = invoice.orders?.[0];
  if (!orderRef) {
    throw new Error(`Invoice ${invoice.id} has no orders`);
  }

  const order = await waitForOrder(orderRef.id);
  const info = order.redemption_info ?? {};

  return {
    brand,
    productId,
    amountUsd,
    code: info.code,
    pin: info.pin,
    link: info.link,
    instructions: info.instructions,
    orderId: order.id,
    invoiceId: invoice.id,
    paymentTxSig,
  };
}
