import { PrismaClient, Role, AccountType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding PayFlow database with realistic demo data...');

  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('AdminPassword123!', salt);
  const viewerPasswordHash = await bcrypt.hash('ViewerPassword123!', salt);

  // 1. Seed Users (Yash as Admin, Alex as Viewer, keeping internal aliases for automated test compatibility)
  await prisma.user.upsert({
    where: { email: 'admin@payflow.internal' },
    update: {
      name: 'Yash Valiya (Admin)',
    },
    create: {
      email: 'admin@payflow.internal',
      passwordHash: adminPasswordHash,
      name: 'Yash Valiya (Admin)',
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: 'viewer@payflow.internal' },
    update: {
      name: 'Alex Rivera (Auditor)',
    },
    create: {
      email: 'viewer@payflow.internal',
      passwordHash: viewerPasswordHash,
      name: 'Alex Rivera (Auditor)',
      role: Role.VIEWER,
    },
  });

  // User-friendly aliases
  await prisma.user.upsert({
    where: { email: 'yash@payflow.dev' },
    update: {},
    create: {
      email: 'yash@payflow.dev',
      passwordHash: adminPasswordHash,
      name: 'Yash Valiya',
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: 'alex@payflow.dev' },
    update: {},
    create: {
      email: 'alex@payflow.dev',
      passwordHash: viewerPasswordHash,
      name: 'Alex Rivera',
      role: Role.VIEWER,
    },
  });

  console.log('Users seeded: Yash Valiya (Admin), Alex Rivera (Auditor)');

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

  // 3. Seed Products with simple, believable developer tools
  const products = [
    {
      sku: 'SKU-PRO-LIC',
      name: 'PayFlow Pro - Developer License',
      description: 'Single-developer commercial license, full source code access, and self-hosted deployment guide.',
      unitAmountMinor: 9900, // $99.00
      currency: 'USD',
      stock: 100,
      imageUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&auto=format&fit=crop&q=60',
    },
    {
      sku: 'SKU-REC-KIT',
      name: 'Nightly Reconciliation Kit',
      description: 'Automated settlement cross-reference scripts and CSV audit reports comparing database vs PayPal.',
      unitAmountMinor: 4900, // $49.00
      currency: 'USD',
      stock: 200,
      imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&auto=format&fit=crop&q=60',
    },
    {
      sku: 'SKU-WBH-DISP',
      name: 'Webhook Reliable Dispatcher',
      description: 'Background queue worker with retry logic and cryptographic signature verification for webhooks.',
      unitAmountMinor: 1900, // $19.00
      currency: 'USD',
      stock: 500,
      imageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&auto=format&fit=crop&q=60',
    },
    {
      sku: 'SKU-ARCH-CALL',
      name: '1-on-1 Architecture Call (1 hr)',
      description: 'Direct video call with Yash to review payment architecture, database indexes, and double-entry ledger design.',
      unitAmountMinor: 14900, // $149.00
      currency: 'USD',
      stock: 20,
      imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=400&auto=format&fit=crop&q=60',
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        name: p.name,
        description: p.description,
        unitAmountMinor: p.unitAmountMinor,
        stock: p.stock,
        imageUrl: p.imageUrl,
      },
      create: p,
    });
  }
  console.log(`Products seeded: ${products.length} products ready for checkout.`);
}

main()
  .catch((e) => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
