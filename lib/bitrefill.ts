import { randomBytes } from "crypto";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { config } from "./config";
import {
  getRewardKeypair,
  getRewardWalletAddress,
  transferSol,
} from "./solana";

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

function solPaymentToLamports(price: number | string): number {
  const amount = typeof price === "string" ? Number.parseFloat(price) : price;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid Bitrefill SOL payment amount: ${price}`);
  }
  return Math.round(amount * LAMPORTS_PER_SOL);
}

async function createBalanceInvoice(lineItem: LineItem): Promise<BitrefillInvoice> {
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
  if (invoice.status !== TERMINAL_INVOICE_OK) {
    invoice = await waitForInvoice(invoice.id);
  }
  return invoice;
}

async function createAndPaySolanaInvoice(
  lineItem: LineItem,
): Promise<{ invoice: BitrefillInvoice; paymentTxSig: string }> {
  const createRes = await brFetch<BitrefillInvoice>("/invoices", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      products: [lineItem],
      payment_method: "solana",
      refund_address: getRewardWalletAddress(),
      auto_pay: false,
    }),
  });

  const invoice = createRes.data;
  const payment = invoice.payment;
  if (!payment?.address || payment.price == null) {
    throw new Error(
      `Invoice ${invoice.id} missing Solana payment details from Bitrefill`,
    );
  }

  const lamports = solPaymentToLamports(payment.price);
  const paymentTxSig = await transferSol(
    getRewardKeypair(),
    payment.address,
    lamports,
  );

  const paidInvoice = await waitForInvoice(invoice.id, 45);
  return { invoice: paidInvoice, paymentTxSig };
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
 *  - live: real product; pays via solana from reward wallet by default
 */
export async function purchaseGiftCard(
  amountUsd: number,
  brand: string,
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

  if (mode === "live" && config.bitrefillPaymentMethod() === "solana") {
    const paid = await createAndPaySolanaInvoice(lineItem);
    invoice = paid.invoice;
    paymentTxSig = paid.paymentTxSig;
  } else {
    invoice = await createBalanceInvoice(lineItem);
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
