/**
 * End-to-end check of the opt-in flow against a running dev server, plus a
 * statistical check of the weighted draw. No funds, no real wallets.
 *
 * Usage:
 *   npx tsx scripts/test-entry-flow.ts            (server on http://localhost:3000)
 *   BASE_URL=https://staging.example npx tsx scripts/test-entry-flow.ts
 */

import { createPrivateKey, sign } from "crypto";
import { Keypair } from "@solana/web3.js";
import { pickWeightedWinner, type DrawEntrant } from "../lib/draw";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function signMessage(keypair: Keypair, message: string): string {
  const key = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(keypair.secretKey.slice(0, 32))]),
    format: "der",
    type: "pkcs8",
  });
  return sign(null, Buffer.from(message, "utf8"), key).toString("base64");
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  const wallet = Keypair.generate();
  const address = wallet.publicKey.toBase58();
  const stranger = Keypair.generate();

  // 1. challenge
  const challenge = await post("/api/enter/challenge", { wallet: address });
  check("challenge issued", challenge.status === 200 && typeof challenge.data.message === "string");
  const { nonce, issuedAt, mac, message } = challenge.data as {
    nonce: string;
    issuedAt: number;
    mac: string;
    message: string;
  };

  // 2. a signature from a different key must be rejected
  const forged = await post("/api/enter", {
    wallet: address,
    nonce,
    issuedAt,
    mac,
    signature: signMessage(stranger, message),
  });
  check("signature from another wallet rejected", forged.status === 401, `status ${forged.status}`);

  // 3. a tampered challenge must be rejected
  const tampered = await post("/api/enter", {
    wallet: address,
    nonce,
    issuedAt: issuedAt + 1,
    mac,
    signature: signMessage(wallet, message),
  });
  check("tampered challenge rejected", tampered.status === 401, `status ${tampered.status}`);

  // 4. a challenge issued for someone else must not work for this wallet
  const other = await post("/api/enter/challenge", { wallet: stranger.publicKey.toBase58() });
  const borrowed = await post("/api/enter", {
    wallet: address,
    nonce: other.data.nonce,
    issuedAt: other.data.issuedAt,
    mac: other.data.mac,
    signature: signMessage(wallet, other.data.message as string),
  });
  check("challenge bound to its wallet", borrowed.status === 401, `status ${borrowed.status}`);

  // 5. the real thing
  const entered = await post("/api/enter", {
    wallet: address,
    nonce,
    issuedAt,
    mac,
    signature: signMessage(wallet, message),
  });
  const standing = entered.data.standing as { entered?: boolean; tier?: string; tickets?: number } | undefined;
  check(
    "valid signature opts the wallet in with 1 ticket",
    entered.status === 200 && standing?.entered === true && standing.tier === "open" && standing.tickets === 1,
    JSON.stringify(standing),
  );

  // 6. idempotent
  const again = await post("/api/enter", {
    wallet: address,
    nonce,
    issuedAt,
    mac,
    signature: signMessage(wallet, message),
  });
  check("entering twice is harmless", again.status === 200);

  // 7. status endpoint agrees
  const statusRes = await fetch(`${BASE_URL}/api/enter/status?wallet=${address}`);
  const status = (await statusRes.json()) as { optedIn?: boolean; tickets?: number };
  check("status shows the entry", statusRes.status === 200 && status.optedIn === true && status.tickets === 1);

  // 8. weighted draw: 20 holders x10 tickets vs 300 walk-ins x1
  const entrants: DrawEntrant[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ wallet: `H${i}`, tier: "holder" as const, weight: 10, amount: 1 })),
    ...Array.from({ length: 300 }, (_, i) => ({ wallet: `O${i}`, tier: "open" as const, weight: 1, amount: 0 })),
  ];
  const runs = 200_000;
  let holderWins = 0;
  const perWallet = new Map<string, number>();
  for (let i = 0; i < runs; i++) {
    const winner = pickWeightedWinner(entrants)!;
    if (winner.tier === "holder") holderWins += 1;
    perWallet.set(winner.wallet, (perWallet.get(winner.wallet) ?? 0) + 1);
  }
  const expected = 200 / 500;
  const observed = holderWins / runs;
  check(
    "holders win in proportion to their tickets",
    Math.abs(observed - expected) < 0.01,
    `observed ${(observed * 100).toFixed(2)}%, expected ${(expected * 100).toFixed(2)}%`,
  );
  const ratio = (perWallet.get("H0") ?? 0) / Math.max(1, perWallet.get("O0") ?? 0);
  check("one holder wins about 10x as often as one walk-in", ratio > 7.5 && ratio < 13, `ratio ${ratio.toFixed(2)}`);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
