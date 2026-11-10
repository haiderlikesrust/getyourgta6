/**
 * Runs once per server process. Everything real lives in instrumentation-node.ts:
 * the import sits inside this exact `NEXT_RUNTIME === "nodejs"` check so the
 * bundler leaves Node-only code (crypto, Prisma) out of the edge build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
