import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function ensureLedgerState() {
  const existing = await prisma.ledgerState.findUnique({
    where: { id: "singleton" },
  });
  if (!existing) {
    await prisma.ledgerState.create({
      data: { id: "singleton", allocatedUsd: 0 },
    });
  }
}
