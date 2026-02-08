import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.org.findMany({
    select: {
      orgId: true,
      name: true
    }
  });

  console.log(JSON.stringify(orgs, null, 2));
  await prisma.$disconnect();
}

main();
