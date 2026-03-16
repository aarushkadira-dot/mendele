import { prisma } from './lib/prisma';

async function main() {
 const count = await prisma.opportunity.count();
 console.log(`Total opportunities: ${count}`);
 const sample = await prisma.opportunity.findMany({ take: 5 });
 console.log('Sample:', JSON.stringify(sample, null, 2));
}

main()
 .catch(e => console.error(e))
 .finally(() => prisma.$disconnect());
