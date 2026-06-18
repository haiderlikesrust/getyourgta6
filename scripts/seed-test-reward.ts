import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_WALLET =
  process.env.TEST_WINNER_WALLET ??
  "Gg8rtJMzNS1xqmHCwx2rMyEVyrxoqiGQTgfvWbdjT6xk";

async function main() {
  await prisma.reward.updateMany({
    where: {
      holderWallet: TEST_WALLET,
      status: "UNCLAIMED",
    },
    data: { status: "CLAIMED", claimedAt: new Date() },
  });

  const reward = await prisma.reward.create({
    data: {
      holderWallet: TEST_WALLET,
      brand: "pending",
      amountUsd: 100,
      status: "UNCLAIMED",
    },
  });

  console.log("Seeded test reward:", reward.id);
  console.log("Wallet:", TEST_WALLET);
  console.log("Winner chooses PlayStation or Xbox at claim time");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
