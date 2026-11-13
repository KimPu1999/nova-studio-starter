/**
 * Phase 18 — billing seed: plan catalog, credit packages, usage meters and the
 * FINANCE_ADMIN role. Idempotent; safe to run repeatedly.
 * Run with: npx tsx prisma/billing-seed.ts
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { PrismaClient, RoleCode } from '@prisma/client';

const prisma = new PrismaClient();

const PLANS: Array<{
  code: string; tier: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS' | 'ENTERPRISE'; name: string; description: string; sortOrder: number;
  monthly: number; annual: number; includedSeats: number; maxSeats: number | null;
  websites: number | null; domains: number | null; storageMb: number | null; bandwidthMb: number | null;
  aiCredits: number; apiRequests: number | null; features: string[];
}> = [
  { code: 'FREE', tier: 'FREE', name: 'Free', description: 'Explore NOVA Studio with core AI builder features.', sortOrder: 10, monthly: 0, annual: 0, includedSeats: 1, maxSeats: 1, websites: 1, domains: 0, storageMb: 500, bandwidthMb: 2_000, aiCredits: 100, apiRequests: 0, features: ['aiBuilder'] },
  { code: 'STARTER', tier: 'STARTER', name: 'Starter', description: 'For solo builders shipping a first website.', sortOrder: 20, monthly: 15_000, annual: 150_000, includedSeats: 2, maxSeats: 3, websites: 2, domains: 1, storageMb: 5_000, bandwidthMb: 25_000, aiCredits: 2_000, apiRequests: null, features: ['aiBuilder', 'hosting', 'customDomain'] },
  { code: 'PRO', tier: 'PRO', name: 'Pro', description: 'For freelancers and small studios.', sortOrder: 30, monthly: 45_000, annual: 450_000, includedSeats: 5, maxSeats: 10, websites: 10, domains: 5, storageMb: 25_000, bandwidthMb: 150_000, aiCredits: 10_000, apiRequests: 50_000, features: ['aiBuilder', 'hosting', 'customDomain', 'apiAccess', 'prioritySupport'] },
  { code: 'BUSINESS', tier: 'BUSINESS', name: 'Business', description: 'For teams running client work at scale.', sortOrder: 40, monthly: 120_000, annual: 1_200_000, includedSeats: 15, maxSeats: 40, websites: 50, domains: 20, storageMb: 100_000, bandwidthMb: 500_000, aiCredits: 40_000, apiRequests: 250_000, features: ['aiBuilder', 'hosting', 'customDomain', 'apiAccess', 'prioritySupport', 'auditLog', 'whiteLabel'] },
  { code: 'ENTERPRISE', tier: 'ENTERPRISE', name: 'Enterprise', description: 'Unlimited-scale workspaces with enterprise controls.', sortOrder: 50, monthly: 350_000, annual: 3_500_000, includedSeats: 50, maxSeats: null, websites: null, domains: null, storageMb: null, bandwidthMb: null, aiCredits: 150_000, apiRequests: 1_000_000, features: ['aiBuilder', 'hosting', 'customDomain', 'apiAccess', 'prioritySupport', 'auditLog', 'whiteLabel', 'sso'] },
];

const CREDIT_PACKAGES = [
  { code: 'CREDITS_1K', name: '1,000 AI credits', credits: 1_000, bonusCredits: 0, priceMmk: 5_000, sortOrder: 10 },
  { code: 'CREDITS_5K', name: '5,000 AI credits + 500 bonus', credits: 5_000, bonusCredits: 500, priceMmk: 25_000, sortOrder: 20 },
  { code: 'CREDITS_20K', name: '20,000 AI credits + 4,000 bonus', credits: 20_000, bonusCredits: 4_000, priceMmk: 90_000, sortOrder: 30 },
];

const METERS = [
  { code: 'AI_TOKENS' as const, name: 'AI token usage', unit: 'tokens', description: 'Input+output tokens across AI features.' },
  { code: 'AI_CREDITS' as const, name: 'AI credits consumed', unit: 'credits', description: 'Credits consumed from wallets and workspaces.' },
  { code: 'API_REQUESTS' as const, name: 'API requests', unit: 'requests', description: 'Public API v1 requests per credential/workspace.' },
  { code: 'HOSTING_STORAGE_MB' as const, name: 'Hosting storage', unit: 'MB', description: 'Storage consumed by hosted websites.' },
  { code: 'HOSTING_BANDWIDTH_MB' as const, name: 'Hosting bandwidth', unit: 'MB', description: 'Bandwidth served by hosted websites.' },
  { code: 'DEPLOYMENTS' as const, name: 'Deployments', unit: 'deployments', description: 'Website deployment counts.' },
];

async function main() {
  await prisma.adminRole.upsert({ where: { code: RoleCode.FINANCE_ADMIN }, update: {}, create: { code: RoleCode.FINANCE_ADMIN, name: 'Finance Admin' } });
  for (const plan of PLANS) {
    const existing = await prisma.billingPlan.findUnique({ where: { code: plan.code }, include: { versions: true } });
    if (!existing) {
      await prisma.billingPlan.create({
        data: {
          code: plan.code, tier: plan.tier, name: plan.name, description: plan.description, sortOrder: plan.sortOrder,
          versions: { create: { version: 1, status: 'ACTIVE', monthlyPriceMmk: plan.monthly, annualPriceMmk: plan.annual, includedSeats: plan.includedSeats, maxSeats: plan.maxSeats, websitesLimit: plan.websites, customDomainsLimit: plan.domains, storageMb: plan.storageMb, bandwidthMb: plan.bandwidthMb, monthlyAiCredits: plan.aiCredits, monthlyApiRequests: plan.apiRequests, features: plan.features } },
        },
      });
    }
  }
  for (const pkg of CREDIT_PACKAGES) {
    await prisma.billingCreditPackage.upsert({ where: { code: pkg.code }, update: {}, create: pkg });
  }
  for (const meter of METERS) {
    await prisma.billingUsageMeter.upsert({ where: { code: meter.code }, update: {}, create: meter });
  }
  console.log('Billing seed complete: 5 plans, 3 credit packages, 6 meters, FINANCE_ADMIN role.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
