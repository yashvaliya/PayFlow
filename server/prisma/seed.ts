import { PrismaClient, Role, AccountType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding PayFlow database...');

  // 1. Seed Users
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('AdminPassword123!', salt);
  const viewerPasswordHash = await bcrypt.hash('ViewerPassword123!', salt);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@payflow.internal' },
    update: {},
    create: {
      email: 'admin@payflow.internal',
      passwordHash: adminPasswordHash,
      name: 'Sarah Chen (Admin)',
      role: Role.ADMIN,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@payflow.internal' },
    update: {},
    create: {
      email: 'viewer@payflow.internal',
      passwordHash: viewerPasswordHash,
      name: 'Alex Rivera (Viewer)',
      role: Role.VIEWER,
    },
  });

  console.log(`Users seeded: Admin (${admin.email}), Viewer (${viewer.email})`);

  // 2. Seed Chart of Ledger Accounts
  const ledgerAccounts = [
    {
      code: 'PAYPAL_CLEARING',
      name: 'PayPal Clearing Asset',
      type: AccountType.ASSET,
      currency: 'USD',
    },
    {
      code: 'MERCHANT_PAYABLE',
      name: 'Merchant Settlement Payable',
      type: AccountType.LIABILITY,
      currency: 'USD',
    },
    {
      code: 'REFUND_CLEARING',
      name: 'Refund Clearing Holding',
      type: AccountType.ASSET,
      currency: 'USD',
    },
  ];

  for (const acc of ledgerAccounts) {
    await prisma.ledgerAccount.upsert({
      where: { code: acc.code },
      update: { name: acc.name, type: acc.type },
      create: {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        currency: acc.currency,
        balanceMinor: 0,
      },
    });
  }
  console.log('Ledger accounts seeded.');

  // 3. Seed Products for the Checkout Store
  const products = [
    {
      name: 'Enterprise API Gateway Subscription',
      sku: 'SKU-ENT-API',
      description: 'High-throughput payment gateway routing with 99.999% SLA and dedicated account manager.',
      unitAmountMinor: 9900, // $99.00
      currency: 'USD',
      stock: 50,
      imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&auto=format&fit=crop&q=60',
    },
    {
      name: 'Fintech Reconciliation Toolkit',
      sku: 'SKU-REC-TOOL',
      description: 'Automated settlement reconciliation and discrepancy detection utility suite.',
      unitAmountMinor: 4900, // $49.00
      currency: 'USD',
      stock: 100,
      imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&auto=format&fit=crop&q=60',
    },
    {
      name: 'Real-time Webhook Stream Node',
      sku: 'SKU-WBH-NODE',
      description: 'Guaranteed-delivery outbox webhook dispatcher with signature verification.',
      unitAmountMinor: 1900, // $19.00
      currency: 'USD',
      stock: 250,
      imageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&auto=format&fit=crop&q=60',
    },
    {
      name: 'PCI-DSS Compliance Audit Package',
      sku: 'SKU-SEC-AUD',
      description: 'Complete security verification, tokenization review, and penetration testing certificate.',
      unitAmountMinor: 14900, // $149.00
      currency: 'USD',
      stock: 20,
      imageUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=400&auto=format&fit=crop&q=60',
    },
  ];

  for (const prod of products) {
    await prisma.product.upsert({
      where: { sku: prod.sku },
      update: {
        name: prod.name,
        description: prod.description,
        unitAmountMinor: prod.unitAmountMinor,
        stock: prod.stock,
        imageUrl: prod.imageUrl,
      },
      create: prod,
    });
  }
  console.log('Products seeded.');

  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
