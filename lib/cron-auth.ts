import { NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { config } from "@/lib/config";

export function authorizeCron(request: NextRequest): boolean {
  const cronSecret = config.cronSecret();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const headerSecret = request.headers.get("x-cron-secret");
  return (
    verifyCronSecret(bearer, cronSecret) ||
    verifyCronSecret(headerSecret, cronSecret)
  );
}
