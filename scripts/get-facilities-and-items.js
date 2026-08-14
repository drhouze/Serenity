const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const facilities = await prisma.facility.findMany({
    where: { organizationId: 'default-org' },
    select: { id: true, name: true },
  });
  console.log('Facilities:', JSON.stringify(facilities, null, 2));
  // Find an inventory item in the first facility
  const item = await prisma.inventoryItem.findFirst({
    where: { facilityId: facilities[0].id, currentStock: { gte: 5 } },
    select: { id: true, name: true, currentStock: true, unit: true, unitCost: true, facilityId: true },
  });
  console.log('Source item:', JSON.stringify(item, null, 2));
  await prisma.$disconnect();
})();
