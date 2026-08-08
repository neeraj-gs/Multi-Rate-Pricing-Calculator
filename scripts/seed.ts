/**
 * Seeds a demo account with a year of plausible documents.
 *
 * Deliberately goes through `createDocument` and `finalizeDocument` rather than
 * inserting records directly. Seeded data therefore passes exactly the same
 * validation and pricing as anything a user creates — a seed script that writes
 * straight to the collection is how you end up demoing a state the application
 * could never produce.
 *
 *   npm run seed
 *
 * Re-running wipes the demo account and rebuilds it. Other accounts are never
 * touched.
 */

import { Types } from 'mongoose';

// Node loads .env files natively from v20.6 — no dotenv dependency needed just
// to run a script. `.env.local` is Next's convention, so the script and the app
// read the same file.
try {
  process.loadEnvFile('.env.local');
} catch {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Fall through: the connection helper raises a clear error if MONGODB_URI
    // is genuinely missing.
  }
}


/* eslint-disable import/first */
import {
  AuditLog,
  Counter,
  DocumentModel,
  ShareLink,
  User,
  connectToDatabase,
  disconnectFromDatabase,
} from '../src/lib/db';
import { hashPassword } from '../src/lib/auth/password';
import { createDocument, finalizeDocument } from '../src/lib/documents/service';
import { createDocumentSchema } from '../src/lib/validation/documents';

const DEMO_EMAIL = 'demo@ledgerline.app';
const DEMO_PASSWORD = 'demo-password-2026';

const CUSTOMERS = [
  { name: 'Acme Trading LLC', email: 'accounts@acmetrading.ae', address: 'Office 1204, Boulevard Plaza Tower 1, Dubai' },
  { name: 'Northwind Logistics', email: 'ap@northwind-log.com', address: 'Jebel Ali Free Zone, Dubai' },
  { name: 'Cedar & Co Consulting', email: 'finance@cedarco.io', address: 'DIFC Gate Village 4, Dubai' },
  { name: 'Meridian Health Group', email: 'procurement@meridianhg.com', address: 'Riyadh Front, Riyadh' },
  { name: 'Bluepeak Studios', email: 'hello@bluepeak.design', address: 'Studio City, Dubai' },
  { name: 'Halcyon Robotics', email: 'billing@halcyon.tech', address: 'Masdar City, Abu Dhabi' },
];

const CATALOGUE = [
  { description: 'Implementation — discovery workshop', unitPrice: '4500.00' },
  { description: 'Platform licence, annual', unitPrice: '18000.00' },
  { description: 'Data migration, per source system', unitPrice: '2750.00' },
  { description: 'Custom integration build', unitPrice: '9800.00' },
  { description: 'Senior engineer, per day', unitPrice: '1250.00' },
  { description: 'Support retainer, monthly', unitPrice: '3200.00' },
  { description: 'Training session, half day', unitPrice: '1800.00' },
  { description: 'Security review', unitPrice: '6400.00' },
  { description: 'Onboarding fee', unitPrice: '950.00' },
  { description: 'Hosting, per environment', unitPrice: '480.00' },
];

/**
 * Deterministic pseudo-randomness.
 *
 * The same seed produces the same demo data every time, so a screenshot taken
 * today still matches the app tomorrow — and a figure quoted in the README
 * stays true.
 */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const random = makeRandom(20_260_808);

function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * A date inside a given month, counting back from the current one.
 *
 * Day is clamped to 28 so February never rolls forward into March and quietly
 * moves a document into the wrong reporting period. Never dated in the future,
 * so "this month" is always partial rather than oddly complete.
 */
function isoInMonth(monthsAgo: number, dayOfMonth: number): string {
  const now = new Date();
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, Math.min(dayOfMonth, 28)),
  );
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (target > today) target.setUTCDate(Math.max(1, now.getUTCDate() - 1));
  return target.toISOString().slice(0, 10);
}

async function main() {
  await connectToDatabase();
  console.log('Connected.');

  /*
   * Reset the demo account's *data*, but keep the account itself.
   *
   * Deleting and recreating the user mints a new ObjectId, and any session
   * cookie still in a browser carries the old one — so after a reseed you are
   * signed in as a user that no longer exists and the app shows you an empty
   * account. Preserving the id makes reseeding safe to run while logged in.
   */
  const existing = await User.findOne({ email: DEMO_EMAIL }).lean();

  if (existing) {
    const userId = new Types.ObjectId(String(existing._id));
    await Promise.all([
      DocumentModel.deleteMany({ userId }),
      AuditLog.deleteMany({ userId }),
      ShareLink.deleteMany({ userId }),
      Counter.deleteOne({ _id: `${String(existing._id)}:document` }),
    ]);
    console.log('Cleared the demo account’s documents (the account itself is kept).');
  }

  const user = await User.findOneAndUpdate(
    { email: DEMO_EMAIL },
    {
      $set: {
        name: 'Demo Reviewer',
        company: 'LedgerLine Demo Co',
        passwordHash: await hashPassword(DEMO_PASSWORD),
        preferences: { currency: 'AED', defaultTaxPercent: 500, documentPrefix: 'QT' },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const userId = String(user!._id);
  console.log(`${existing ? 'Refreshed' : 'Created'} ${DEMO_EMAIL}`);

  // --- The brief's sample document, first, so it is easy to find ---------
  const sample = await createDocument(
    userId,
    createDocumentSchema.parse({
      title: 'Worked example — brief sample',
      customer: CUSTOMERS[0],
      issueDate: isoDaysAgo(2),
      currency: 'USD',
      notes:
        'The sample from the assignment brief. Subtotal 450.00, discount 40.00, tax 11.50, grand total 421.50.',
      lines: [
        {
          description: 'Widget A',
          quantity: '2',
          unitPrice: '100.00',
          discount: { type: 'percent', value: '10' },
          taxPercent: '5',
        },
        { description: 'Widget B', quantity: '1', unitPrice: '50.00', taxPercent: '5' },
        {
          description: 'Service fee',
          quantity: '1',
          unitPrice: '200.00',
          discount: { type: 'fixed', value: '20.00' },
        },
      ],
    }),
  );

  if (sample.totals.grandTotal !== '421.50') {
    throw new Error(
      `The engine produced ${sample.totals.grandTotal} for the brief's sample. Expected 421.50.`,
    );
  }
  console.log(`  ${sample.number}  worked example         ${sample.totals.grandTotal} USD`);

  /*
   * A year of documents, distributed month by month rather than by scattering
   * random dates across 330 days.
   *
   * Uniform random dates leave gaps — a trend chart with three empty months in
   * it looks broken rather than sparse, and the report is the page a reviewer
   * spends the longest on. Walking the months and placing 2–4 documents in each
   * guarantees every bucket has a bar, while the counts still vary enough to be
   * worth plotting.
   */
  let created = 1;
  let finalized = 0;

  const plan: Array<{ monthsAgo: number; dayOfMonth: number }> = [];
  for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo -= 1) {
    const perMonth = 2 + Math.floor(random() * 3); // 2–4
    for (let n = 0; n < perMonth; n += 1) {
      plan.push({ monthsAgo, dayOfMonth: 2 + Math.floor(random() * 26) });
    }
  }

  for (const slot of plan) {
    const customer = pick(CUSTOMERS);
    const currency = random() < 0.62 ? 'AED' : random() < 0.65 ? 'USD' : 'SAR';
    const lineCount = 1 + Math.floor(random() * 5);

    const lines = Array.from({ length: lineCount }, () => {
      const item = pick(CATALOGUE);
      const quantity = 1 + Math.floor(random() * 6);
      const roll = random();

      // A fixed discount larger than its line subtotal is rejected by the
      // engine — correctly, and the seed hit that on its first run. The fix
      // belongs here, not in the rule: pick a fixed amount the line can
      // actually carry. Whole-currency-unit arithmetic on the catalogue's own
      // integer prices, used only to choose plausible input.
      const wholeUnitPrice = Number(item.unitPrice.split('.')[0]);
      const affordableFixed = ['500.00', '250.00', '100.00'].find(
        (candidate) => Number(candidate.split('.')[0]) <= wholeUnitPrice * quantity,
      );

      return {
        description: item.description,
        quantity: String(quantity),
        unitPrice: item.unitPrice,
        discount:
          roll < 0.3
            ? { type: 'percent' as const, value: pick(['5', '7.5', '10', '12.5', '15']) }
            : roll < 0.45 && affordableFixed
              ? { type: 'fixed' as const, value: affordableFixed }
              : null,
        taxPercent: random() < 0.85 ? '5' : null,
      };
    });

    const document = await createDocument(
      userId,
      createDocumentSchema.parse({
        title: pick([
          'Annual platform renewal',
          'Implementation phase 1',
          'Q3 professional services',
          'Integration build — Xero',
          'Support retainer 2026',
          'Migration and onboarding',
          'Security review engagement',
          'Discovery and scoping',
        ]),
        customer,
        issueDate: isoInMonth(slot.monthsAgo, slot.dayOfMonth),
        currency,
        lines,
      }),
    );
    created += 1;

    // Most documents in a real book are issued; a few are still in progress.
    if (random() < 0.68) {
      await finalizeDocument(userId, document.id, undefined);
      finalized += 1;
    }
  }

  console.log('');
  console.log(`  ${created} documents (${finalized} finalized, ${created - finalized} draft)`);
  console.log('');
  console.log('  Sign in with:');
  console.log(`    ${DEMO_EMAIL}`);
  console.log(`    ${DEMO_PASSWORD}`);
  console.log('');

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error('Seed failed:', error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(1);
});
