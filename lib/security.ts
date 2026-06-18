import { NextRequest } from "next/server";

const CUID_PATTERN = /^c[a-z0-9]{24}$/i;
const MAX_CLAIM_TOKEN_LENGTH = 128;

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function safeClientError(error: unknown, fallback: string): string {
  if (!isProduction() && error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function isValidClaimId(value: string): boolean {
  return value.length <= 32 && CUID_PATTERN.test(value);
}

export function isValidClaimToken(value: string): boolean {
  return value.length > 0 && value.length <= MAX_CLAIM_TOKEN_LENGTH;
}

export function extractClaimAuth(request: NextRequest): {
  claimId: string | null;
  claimToken: string | null;
} {
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (bearer) {
    const claimId = request.headers.get("x-claim-id")?.trim() ?? null;
    return { claimId, claimToken: bearer };
  }

  const claimId = request.nextUrl.searchParams.get("claimId")?.trim() ?? null;
  const claimToken =
    request.nextUrl.searchParams.get("claimToken")?.trim() ?? null;
  return { claimId, claimToken };
}

export async function parseClaimAuthBody(
  request: NextRequest,
): Promise<{ claimId: string | null; claimToken: string | null }> {
  try {
    const body = (await request.json()) as {
      claimId?: string;
      claimToken?: string;
    };
    return {
      claimId: body.claimId?.trim() ?? null,
      claimToken: body.claimToken?.trim() ?? null,
    };
  } catch {
    return { claimId: null, claimToken: null };
  }
}
