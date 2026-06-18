import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function generateClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyClaimToken(token: string, storedHash: string): boolean {
  const computed = hashClaimToken(token);
  return timingSafeEqualString(computed, storedHash);
}

export function verifyCronSecret(
  provided: string | null,
  expected: string,
): boolean {
  if (!provided) return false;
  return timingSafeEqualString(provided, expected);
}
