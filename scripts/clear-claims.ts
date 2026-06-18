import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.claim.deleteMany();
  console.log("Deleted claims:", deleted.count);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
